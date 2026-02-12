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

    const splitCSVLine = (line: string) => {
        const result = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                result.push(cur.trim().replace(/^"|"$/g, ''));
                cur = "";
            } else {
                cur += char;
            }
        }
        result.push(cur.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase());

    return lines.slice(1).map(line => {
        const values = splitCSVLine(line);
        const obj: any = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] || null;
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

        // Step B: Bot Fallback (Sequential Queue)
        if (leads.length === 0) {
            const botBaseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'https://gmaps-simple-scraper.puro.software';
            try {
                // 1. Initialize with FIRST locality synchronously to get the searchId
                const firstLoc = localidades[0];
                const coords = await getGeolocation(firstLoc, provincia);
                if (!coords) throw new Error(`Could not geolocate locality: ${firstLoc}`);

                const firstJobPayload = {
                    name: `Queue-${rubro.substring(0, 5)}-${firstLoc.substring(0, 5)}`,
                    keywords: [rubro],
                    lang: "es",
                    zoom: 14,
                    lat: coords.lat.toString(),
                    lon: coords.lon.toString(),
                    fast_mode: true,
                    radius: 5000,
                    depth: 5,
                    max_time: 600
                };

                const createJobResponse = await axios.post(`${botBaseUrl}/api/v1/jobs`, firstJobPayload, { httpsAgent });
                const searchId = createJobResponse.data.id || createJobResponse.data.ID;

                // Create tracking record
                await supabase.from('search_tracking').upsert({
                    id: searchId,
                    bot_job_id: searchId,
                    status: `Procesando ${firstLoc} (1/${localidades.length})...`,
                    rubro,
                    localidad: firstLoc
                });

                // 2. Launch Background Queue Loop
                (async () => {
                    const aggregatedLeads: any[] = [];
                    try {
                        for (let i = 0; i < localidades.length; i++) {
                            const currentLoc = localidades[i];
                            console.log(`[Queue] Processing ${currentLoc} (${i + 1}/${localidades.length})`);

                            // Update status to current locality
                            await supabase.from('search_tracking').update({
                                status: `Procesando ${currentLoc} (${i + 1}/${localidades.length})...`
                            }).eq('id', searchId);

                            let currentJobId = '';
                            if (i === 0) {
                                currentJobId = searchId;
                            } else {
                                const cCoords = await getGeolocation(currentLoc, provincia);
                                if (cCoords) {
                                    const cPayload = {
                                        name: `QueuePart-${searchId.substring(0, 4)}-${currentLoc.substring(0, 5)}`,
                                        keywords: [rubro],
                                        lang: "es",
                                        zoom: 14,
                                        lat: cCoords.lat.toString(),
                                        lon: cCoords.lon.toString(),
                                        fast_mode: true,
                                        radius: 5000,
                                        depth: 5,
                                        max_time: 400
                                    };
                                    const cResp = await axios.post(`${botBaseUrl}/api/v1/jobs`, cPayload, { httpsAgent });
                                    currentJobId = cResp.data.id || cResp.data.ID;
                                }
                            }

                            if (currentJobId) {
                                // Poll for current job
                                let jobStatus = 'pending';
                                let attempts = 0;
                                while (jobStatus !== 'ok' && jobStatus !== 'completed' && jobStatus !== 'failed' && attempts < 80) {
                                    await new Promise(r => setTimeout(r, 5000));
                                    const statusResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${currentJobId}`, { httpsAgent });
                                    jobStatus = statusResponse.data.Status || statusResponse.data.status;
                                    attempts++;
                                }

                                if (jobStatus === 'ok' || jobStatus === 'completed') {
                                    const csvResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${currentJobId}/download`, { httpsAgent });
                                    const partLeads = parseCSV(csvResponse.data);

                                    // Map and Add to aggregate
                                    partLeads.forEach(l => {
                                        let mail = l.extended_emails || l.email;
                                        if (!mail && l.emails) mail = typeof l.emails === 'string' ? l.emails.split(',')[0] : (l.emails[0] || 'No disponible');

                                        aggregatedLeads.push({
                                            id: l.place_id || l.id || l.cid || `lead-${Math.random().toString(36).substring(7)}`,
                                            nombre: l.title || l.name || 'Nombre Reservado',
                                            whatsapp: l.phone || l.whatsapp,
                                            web: l.website || l.web,
                                            email: mail || 'No disponible',
                                            direccion: l.address || l.complete_address || 'No disponible',
                                            localidad: l.city || currentLoc,
                                            rubro: l.category || rubro,
                                            instagram: l.instagram || 'No disponible',
                                            facebook: l.facebook || 'No disponible',
                                            horario: l.opening_hours || l.hours || l.opening_hour || 'No disponible'
                                        });

                                        // Post-process socials from other fields if missing
                                        const last = aggregatedLeads[aggregatedLeads.length - 1];
                                        const searchFields = [l.website, l.web, l.webcity, l.emails, l.extended_emails].filter(Boolean);

                                        if (last.instagram === 'No disponible') {
                                            for (const f of searchFields) {
                                                const h = extractSocialHandle(f, 'instagram');
                                                if (h) { last.instagram = h; break; }
                                            }
                                        }
                                        if (last.facebook === 'No disponible') {
                                            for (const f of searchFields) {
                                                const h = extractSocialHandle(f, 'facebook');
                                                if (h) { last.facebook = h; break; }
                                            }
                                        }
                                    });
                                }
                            }
                        }

                        // Final Scoring and Saving
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
                                .slice(0, 5); // Increased to top 5 as discussed previously for free searches or just more variety

                            await supabase.from('search_tracking').update({
                                status: 'completed',
                                total_leads: aggregatedLeads.length,
                                results: topLeads
                            }).eq('id', searchId);
                        } else {
                            await supabase.from('search_tracking').update({ status: 'completed', total_leads: 0, results: [] }).eq('id', searchId);
                        }

                    } catch (bgErr: any) {
                        console.error('[Background Queue] Error:', bgErr);
                        await supabase.from('search_tracking').update({ status: 'error', error_message: bgErr.message }).eq('id', searchId);
                    }
                })();

                return NextResponse.json({ status: 'processing', searchId });
            } catch (botErr: any) {
                console.error('Queue initiation error:', botErr);
                return NextResponse.json({ error: botErr.message }, { status: 500 });
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
