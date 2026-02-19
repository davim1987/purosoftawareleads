import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import axios from 'axios';
import https from 'https';
import { maskEmail, maskPhone, maskSocial } from '@/lib/utils';

// Agent to allow self-signed certificates for the bot
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Simple in-memory fallback for rate limiting if DB fails
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Helper for CSV Parsing
function parseCSV(csvText: string) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Detect separator (auto-comma or semi-colon)
    const firstLine = lines[0];
    const separator = firstLine.includes(';') && (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    const splitCSVLine = (line: string) => {
        const result: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === separator && !inQuote) {
                result.push(cur.trim().replace(/^"|"$/g, ''));
                cur = "";
            } else {
                cur += char;
            }
        }
        result.push(cur.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    return lines.slice(1).map((line: string) => {
        const values = splitCSVLine(line);
        const obj: any = {};
        headers.forEach((header: string, i: number) => {
            if (header) obj[header] = values[i] || null;
        });
        return obj;
    });
}

// Helper for extracting social handles from URLs
function extractSocialHandle(url: string | null, platform: 'instagram' | 'facebook'): string | null {
    if (!url || typeof url !== 'string') return null;
    if (url === 'null' || url === 'No disponible') return null;

    try {
        // 1. Clean URL from wrappers like l.instagram.com/?u=...
        let targetUrl = url;
        if (url.includes('u=')) {
            const urlMatch = url.match(/u=([^&]+)/);
            if (urlMatch) targetUrl = decodeURIComponent(urlMatch[1]);
        }

        // 2. Check for the platform or linktree fallback
        const isPlatform = targetUrl.toLowerCase().includes(platform);
        const isLinktree = platform === 'instagram' && targetUrl.includes('linktr.ee');

        if (!isPlatform && !isLinktree) return null;

        // 3. Handle Linktree specifically
        if (isLinktree && !isPlatform) {
            const parts = targetUrl.split('linktr.ee/')[1];
            if (parts) return '@' + parts.split(/[?#/]/)[0];
        }

        // 4. Extract handle using patterns
        const patterns = {
            instagram: /(?:instagram\.com\/|instagr\.am\/)(?:[^/?#]+\/)?([^/?#]+)/i,
            facebook: /(?:facebook\.com\/|fb\.com\/)(?:pages\/[^/?#]+\/)?(?:[^/?#]+\/)?([^/?#]+)/i
        };

        const match = targetUrl.match(patterns[platform]);
        if (match && match[1]) {
            const handle = match[1].toLowerCase();
            // Ignore common routing keywords
            if (!['p', 'reel', 'stories', 'explore', 'direct', 'sharer', 'dialog'].includes(handle)) {
                return platform === 'instagram' ? `@${match[1]}` : match[1];
            }
        }
    } catch (e) {
        console.error(`Error parsing ${platform} handle:`, e);
    }
    return null;
}

// Helper for Geolocation with Cache
async function getGeolocation(localidad: string, provincia: string) {
    try {
        const { data: cached } = await supabase
            .from('geolocalizacion')
            .select('*')
            .eq('localidad', localidad)
            .eq('provincia', provincia)
            .single();

        if (cached) return { lat: cached.latitud || cached.lat, lon: cached.longitud || cached.lon };

        console.log(`Geolocating ${localidad}, ${provincia} via Nominatim...`);
        const query = encodeURIComponent(`${localidad}, ${provincia}, Argentina`);
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
            headers: { 'User-Agent': 'PurosoftwareBot/1.0' }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);

            await supabase.from('geolocalizacion').insert({
                localidad,
                provincia,
                latitud: lat,
                longitud: lon,
                partido: result.display_name
            });

            return { lat, lon };
        }
        return null;
    } catch (error) {
        console.error('Geolocation error:', error);
        return null;
    }
}

async function checkRateLimit(ip: string): Promise<boolean> {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    try {
        const { count, error } = await supabase
            .from('search_logs')
            .select('*', { count: 'exact', head: true })
            .eq('ip', ip)
            .gt('timestamp', new Date(Date.now() - ONE_DAY).toISOString());

        if (error) throw error;
        if ((count || 0) >= 10) return false;

        await supabase.from('search_logs').insert({ ip });
        return true;
    } catch (error) {
        const entry = rateLimitMap.get(ip);
        const now = Date.now();
        if (entry && now < entry.resetTime) {
            if (entry.count >= 10) return false;
            entry.count++;
            return true;
        }
        rateLimitMap.set(ip, { count: 1, resetTime: now + ONE_DAY });
        return true;
    }
}

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
        const body = await req.json();
        const { rubro, provincia, localidades } = body;

        if (!rubro || !localidades || !Array.isArray(localidades) || localidades.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const allowed = await checkRateLimit(ip);
        if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

        let leads: any[] = [];
        let totalCountFromDB = 0;

        // Step A: Search DB (Check if we have results for ALL combined)
        try {
            const isFullRequest = req.nextUrl.searchParams.get('full') === 'true';
            const targetTable = isFullRequest ? 'leads_google_maps' : 'leads_free_search';
            let { data: dbLeads } = await supabase
                .from(targetTable)
                .select('*')
                .textSearch('rubro', rubro, { config: 'spanish', type: 'websearch' })
                .in('localidad', localidades);

            if (!dbLeads || dbLeads.length === 0) {
                const { data: ilikeLeads } = await supabase
                    .from(targetTable)
                    .select('*')
                    .ilike('rubro', `%${rubro}%`)
                    .in('localidad', localidades);
                if (ilikeLeads) dbLeads = ilikeLeads;
            }

            if (dbLeads && dbLeads.length > 0) {
                leads = dbLeads;
                totalCountFromDB = dbLeads.length;
            }
        } catch (dbErr) {
            console.error('DB query error:', dbErr);
        }

        // Step B: Bot Fallback (Parallel Execution)
        if (leads.length === 0) {
            const botBaseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'https://gmaps-simple-scraper.puro.software';
            const searchId = crypto.randomUUID();

            try {
                // 1. Parallel Geolocation for ALL localities
                console.log(`[Parallel Search] Geolocating ${localidades.length} localities...`);
                const coordsResults = await Promise.all(
                    localidades.map(loc => getGeolocation(loc, provincia))
                );

                const validLocs = localidades.filter((_, idx) => coordsResults[idx] !== null);
                const validCoords = coordsResults.filter(c => c !== null);

                // Create a mapping of locality name -> coordinates for the webhook
                const validCoordsMap: Record<string, { lat: number, lon: number }> = {};
                validLocs.forEach((loc, idx) => {
                    validCoordsMap[loc] = validCoords[idx];
                });

                if (validLocs.length === 0) {
                    throw new Error('No se pudo geolocalizar ninguna localidad.');
                }

                // Create initial tracking record (without bot_job_id yet)
                await supabase.from('search_tracking').upsert({
                    id: searchId,
                    status: `Geolocalizando ${validLocs.length} zonas...`,
                    rubro,
                    localidad: validLocs.join(', ')
                });

                // 2. Launch Background Parallel Processing Loop
                (async () => {
                    const aggregatedLeads: any[] = [];
                    const subJobIds: string[] = [];

                    try {
                        // Launch all bot jobs in parallel
                        console.log(`[Parallel Search] Launching ${validLocs.length} bot jobs...`);
                        const jobRequests = validCoords.map((coords, idx) => {
                            const payload = {
                                name: `P-${searchId.substring(0, 4)}-${validLocs[idx].substring(0, 5)}`,
                                keywords: [rubro],
                                lang: "es",
                                zoom: 14,
                                lat: coords.lat.toString(),
                                lon: coords.lon.toString(),
                                fast_mode: true,
                                radius: 5000,
                                depth: 2, // Reduced depth for faster teaser results
                                max_time: 400
                            };
                            return axios.post(`${botBaseUrl}/api/v1/jobs`, payload, { httpsAgent });
                        });

                        const jobResponses = await Promise.all(jobRequests);
                        const actualJobIds = jobResponses.map(r => {
                            const id = r.data.id || r.data.ID || r.data.job_id;
                            console.log(`[Parallel Search] Bot response for job:`, JSON.stringify(r.data));
                            return id;
                        }).filter(Boolean);

                        subJobIds.push(...actualJobIds);

                        // Update status and store ACTUAL bot job IDs
                        const botJobIdString = subJobIds.join(', ');
                        console.log(`[Parallel Search] Storing actual bot job IDs: ${botJobIdString}`);

                        await supabase.from('search_tracking').update({
                            status: `Procesando (0/${validLocs.length})...`,
                            bot_job_id: botJobIdString
                        }).eq('id', searchId);

                        let completedCount = 0;

                        // Parallel Polling for all sub-jobs
                        console.log(`[Parallel Search] Polling sub-jobs: ${subJobIds.join(', ')}`);
                        await Promise.all(subJobIds.map(async (jobId, idx) => {
                            const currentLoc = validLocs[idx];
                            let jobStatus = 'pending';
                            let attempts = 0;

                            // Polling loop with more attempts and terminal states
                            while (attempts < 200) {
                                try {
                                    const statusResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}`, { httpsAgent });
                                    jobStatus = (statusResponse.data.Status || statusResponse.data.status || 'pending').toLowerCase();
                                    console.log(`[Job ${jobId}] Status: ${jobStatus} (Attempt ${attempts + 1})`);
                                } catch (e) {
                                    console.error(`[Job ${jobId}] Polling error:`, e);
                                }

                                if (['ok', 'completed', 'success', 'failed', 'finished', 'done', 'error'].includes(jobStatus)) break;

                                await new Promise(r => setTimeout(r, 1000));
                                attempts++;
                            }

                            if (['ok', 'completed', 'success', 'finished', 'done'].includes(jobStatus)) {
                                try {
                                    console.log(`[Job ${jobId} - ${currentLoc}] Success! Downloading results...`);
                                    const csvResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}/download`, { httpsAgent });

                                    // Log a sample of the raw content for debugging
                                    const rawSample = typeof csvResponse.data === 'string' ? csvResponse.data.substring(0, 150) : 'JSON Payload';
                                    console.log(`[Job ${jobId}] Raw content sample: [${rawSample}]`);

                                    const partLeads = parseCSV(csvResponse.data);
                                    console.log(`[Job ${jobId}] Found ${partLeads.length} leads in CSV.`);

                                    partLeads.forEach(l => {
                                        // Robust header mapping
                                        let mail = l.extended_emails || l.email || l['email address'] || l.emails;
                                        if (!mail && l.emails) mail = typeof l.emails === 'string' ? l.emails.split(',')[0] : (l.emails[0] || 'No disponible');

                                        const leadObj = {
                                            id: l.place_id || l.id || l.cid || `lead-${Math.random().toString(36).substring(7)}`,
                                            nombre: l.title || l.name || l['business name'] || 'Nombre Reservado',
                                            whatsapp: l.phone || l.whatsapp || l['phone number'] || l.phone_number,
                                            web: l.website || l.web || l['website url'] || l.url,
                                            email: mail || 'No disponible',
                                            direccion: l.address || l.complete_address || l['full address'] || l.formatted_address || 'No disponible',
                                            localidad: l.city || l.sublocality || currentLoc,
                                            rubro: l.category || l.type || rubro,
                                            instagram: l.instagram || l['instagram handle'] || 'No disponible',
                                            facebook: l.facebook || l['facebook page'] || 'No disponible',
                                            horario: l.opening_hours || l.hours || l['business hours'] || 'No disponible'
                                        };

                                        // Process socials
                                        const searchFields = [l.website, l.web, l.webcity, l.emails, l.extended_emails, l.description].filter(Boolean);
                                        if (leadObj.instagram === 'No disponible') {
                                            for (const f of searchFields) {
                                                const h = extractSocialHandle(f, 'instagram');
                                                if (h) { leadObj.instagram = h; break; }
                                            }
                                        }
                                        if (leadObj.facebook === 'No disponible') {
                                            for (const f of searchFields) {
                                                const h = extractSocialHandle(f, 'facebook');
                                                if (h) { leadObj.facebook = h; break; }
                                            }
                                        }
                                        aggregatedLeads.push(leadObj);
                                    });
                                } catch (dlErr) {
                                    console.error(`[Job ${jobId}] Download/Parse error:`, dlErr);
                                }
                            } else {
                                console.error(`[Job ${jobId}] Failed or timed out (Final Status: ${jobStatus})`);
                            }

                            completedCount++;
                            // Update granular status for the frontend
                            await supabase.from('search_tracking').update({
                                status: `Procesando (${completedCount}/${validLocs.length})...`
                            }).eq('id', searchId);
                        }));

                        // Final Scoring and Saving
                        console.log(`[Parallel Search] Total leads aggregated: ${aggregatedLeads.length}`);
                        if (aggregatedLeads.length > 0) {
                            const getScore = (l: any) => {
                                let s = 0;
                                if (l.email && l.email !== 'No disponible') s += 10;
                                if (l.whatsapp) s += 10;
                                if (l.instagram && l.instagram !== 'No disponible') s += 5;
                                return s;
                            };

                            const topLeads = aggregatedLeads
                                .sort((a, b) => getScore(b) - getScore(a))
                                .slice(0, 5)
                                .map(l => ({
                                    ...l,
                                    whatsapp: l.whatsapp ? maskPhone(l.whatsapp) : l.whatsapp,
                                    email: (l.email && l.email !== 'No disponible') ? maskEmail(l.email) : l.email,
                                    instagram: (l.instagram && l.instagram !== 'No disponible') ? maskSocial(l.instagram) : l.instagram,
                                    facebook: (l.facebook && l.facebook !== 'No disponible') ? maskSocial(l.facebook) : l.facebook,
                                }));

                            console.log(`[Parallel Search] Saving ${topLeads.length} MASKED top leads to tracking ${searchId}`);
                            const { error: updateError } = await supabase.from('search_tracking').update({
                                status: 'completed',
                                total_leads: aggregatedLeads.length,
                                results: topLeads
                            }).eq('id', searchId);

                            if (updateError) console.error(`[Parallel Search] DB Update Error:`, updateError);
                        } else {
                            console.log(`[Parallel Search] No leads found. Marking search as completed (empty).`);
                            await supabase.from('search_tracking').update({ status: 'completed', total_leads: 0, results: [] }).eq('id', searchId);
                        }

                    } catch (bgErr: any) {
                        console.error('[Parallel Background] Error:', bgErr);
                        await supabase.from('search_tracking').update({ status: 'error', error_message: bgErr.message }).eq('id', searchId);
                    }
                })();

                return NextResponse.json({ status: 'processing', searchId, coords: validCoordsMap });
            } catch (pErr: any) {
                console.error('Parallel initiation error:', pErr);
                return NextResponse.json({ error: pErr.message }, { status: 500 });
            }
        }

        // Case: Leads found in DB
        const getQualityScore = (l: any) => {
            let s = 0;
            if (l.Email || l.email) s += 10;
            if (l.Whatssap || l.whatsapp) s += 10;
            if (l.instagram) s += 5;
            return s;
        };
        leads.sort((a, b) => getQualityScore(b) - getQualityScore(a));

        const mappedLeads = leads.map(l => {
            const m: any = {
                id: l.id || `p-${Math.random()}`,
                nombre: l.Nombre || l.nombre || 'Nombre Reservado',
                rubro: l.Rubro || l.rubro || rubro,
                direccion: l.Direccion || l.direccion || 'No disponible',
                localidad: l.Localidad || l.localidad || '',
                provincia: l.Provincia || l.provincia || provincia,
                email: l.Email || l.email || null,
                whatsapp: l.Whatssap || l.whatsapp || null,
                web: l.Web || l.web || null,
                instagram: l.instagram || null,
                facebook: l.Facebook || null,
                horario: l.Horario || l.horario || l.opening_hours || null
            };

            // Enhance socials for DB leads if missing
            if (!m.instagram) m.instagram = extractSocialHandle(m.web, 'instagram');
            if (!m.facebook) m.facebook = extractSocialHandle(m.web, 'facebook');

            return m;
        });

        const isFullRequest = req.nextUrl.searchParams.get('full') === 'true';
        if (isFullRequest) return NextResponse.json({ count: totalCountFromDB, leads: mappedLeads });

        const maskedLeads = mappedLeads.slice(0, 5).map(l => ({
            ...l,
            email: maskEmail(l.email || ''),
            whatsapp: maskPhone(l.whatsapp || ''),
            instagram: maskSocial(l.instagram || ''),
            facebook: maskSocial(l.facebook || '')
        }));

        return NextResponse.json({ count: totalCountFromDB, leads: maskedLeads });

    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
