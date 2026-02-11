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
// Map<IP, { count: number, resetTime: number }>
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Helper for CSV Parsing
function parseCSV(csvText: string) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Header logic: State machine to split by comma respecting quotes
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

// Helper for Geolocation with Cache
async function getGeolocation(localidad: string, provincia: string) {
    try {
        // 1. Check Cache
        const { data: cached } = await supabase
            .from('geolocalizacion')
            .select('*')
            .eq('localidad', localidad)
            .eq('provincia', provincia)
            .single();

        if (cached) return { lat: cached.latitud || cached.lat, lon: cached.longitud || cached.lon };

        // 2. Fallback to OpenStreetMap (Nominatim)
        console.log(`Geolocating ${localidad}, ${provincia} via Nominatim...`);
        const query = encodeURIComponent(`${localidad}, ${provincia}, Argentina`);
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
            headers: { 'User-Agent': 'PurosoftwareBot/1.0' }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);

            // Save to cache with correct column names (latitud/longitud)
            const { error: insertError } = await supabase.from('geolocalizacion').insert({
                localidad,
                provincia,
                latitud: lat,
                longitud: lon,
                partido: result.display_name
            });

            if (insertError) {
                console.error('Error saving geolocation to cache:', insertError);
            }

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
        // Supabase way: Use a table 'search_logs'
        // First, try to insert. If table doesn't exist, this will fail.
        // In a real Supabase setup, tables should be created via Dashboard or Migration.
        // We will assume it might fail and fallback.

        // Clean old logs (optional, or rely on RLS/Cron)
        // await supabase.from('search_logs').delete().lt('timestamp', new Date(Date.now() - ONE_DAY).toISOString());

        const { count, error } = await supabase
            .from('search_logs')
            .select('*', { count: 'exact', head: true })
            .eq('ip', ip)
            .gt('timestamp', new Date(Date.now() - ONE_DAY).toISOString());

        if (error) throw error;

        if ((count || 0) >= 3) {
            return false;
        }

        await supabase.from('search_logs').insert({ ip });
        return true;

    } catch (error) {
        console.warn('Rate limit DB check failed (table might not exist), falling back to memory.', error);

        const entry = rateLimitMap.get(ip);
        const now = Date.now();

        if (entry && now < entry.resetTime) {
            if (entry.count >= 3) return false;
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
        const { rubro, provincia, localidades, searchId } = body;

        if (!rubro || !localidades || !Array.isArray(localidades) || localidades.length === 0) {
            return NextResponse.json({ error: 'Missing required fields: rubro, localidades[]' }, { status: 400 });
        }

        // Rate Limit Check
        const allowed = await checkRateLimit(ip);
        if (!allowed) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 24 hours.' }, { status: 429 });
        }

        console.log(`Searching: rubro: "${rubro}" in localities:`, localidades);

        let leads: any[] = [];
        let totalCount = 0;

        // Step A: Search DB via Supabase first
        try {
            const isFullRequest = req.nextUrl.searchParams.get('full') === 'true';
            const targetTable = isFullRequest ? 'leads_google_maps' : 'leads_free_search';

            console.log(`Searching in table: ${targetTable} (full=${isFullRequest})`);

            // First try Text Search (High quality matching)
            let { data: dbLeads, error: dbError } = await supabase
                .from(targetTable)
                .select('*')
                .textSearch('rubro', rubro, {
                    config: 'spanish',
                    type: 'websearch'
                })
                .in('localidad', localidades);

            // Fallback: If Text Search fails or returns nothing, try ILIKE
            if (dbError || !dbLeads || dbLeads.length === 0) {
                const { data: ilikeLeads, error: ilikeError } = await supabase
                    .from(targetTable)
                    .select('*')
                    .ilike('rubro', `%${rubro}%`)
                    .in('localidad', localidades);

                if (!ilikeError && ilikeLeads) {
                    dbLeads = ilikeLeads;
                }
            }

            // If full request and nothing found in google_maps, fallback to free_search to at least show something
            if (isFullRequest && (!dbLeads || dbLeads.length === 0)) {
                console.log('No results in google_maps, checking free_search fallback...');
                const { data: fallbackLeads } = await supabase
                    .from('leads_free_search')
                    .select('*')
                    .ilike('rubro', `%${rubro}%`)
                    .in('localidad', localidades);

                if (fallbackLeads && fallbackLeads.length > 0) {
                    dbLeads = fallbackLeads;
                }
            }

            if (dbLeads && dbLeads.length > 0) {
                console.log(`Leads found in DB (${targetTable}): ${dbLeads.length}`);
                leads = dbLeads;
                totalCount = dbLeads.length;
            }
        } catch (dbErr) {
            console.error('Supabase query error:', dbErr);
        }

        // Step B: PS-Bot Fallback if no results in DB
        if (leads.length === 0 && searchId) {
            // --- STATE GUARD: Check if search is already in progress or completed ---
            const { data: existingTracking } = await supabase
                .from('search_tracking')
                .select('status, total_leads')
                .eq('id', searchId)
                .single();

            if (existingTracking) {
                if (existingTracking.status === 'geolocating' || existingTracking.status === 'scraping' || existingTracking.status === 'processing') {
                    console.log(`[Guard] Search ${searchId} is already in progress (${existingTracking.status}). Skipping new bot job.`);
                    return NextResponse.json({ status: 'processing', searchId });
                }
                if (existingTracking.status === 'completed') {
                    console.log(`[Guard] Search ${searchId} is already completed. No leads found for query.`);
                    return NextResponse.json({ leads: [], count: 0, status: 'completed' });
                }
            }
            // -----------------------------------------------------------------------

            console.log(`Initializing tracking for SearchID: ${searchId}`);

            // 1. Create Initial State synchronously
            const { error: trackError } = await supabase.from('search_tracking').upsert({
                id: searchId,
                status: 'geolocating',
                rubro,
                localidad: localidades[0]
            });

            if (trackError) {
                console.error('Error creating tracking record:', trackError);
                return NextResponse.json({ error: 'Error initiating search tracking' }, { status: 500 });
            }

            // Initiate background process
            (async () => {
                const botBaseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'https://gmaps-simple-scraper.puro.software';
                try {
                    // 2. Geolocation
                    console.log(`[Background] Geolocating for ${searchId}...`);
                    const coords = await getGeolocation(localidades[0], provincia);
                    if (!coords) throw new Error('Could not geolocation locality');

                    // 3. Update to Scraping
                    console.log(`[Background] Creating Bot Job for ${searchId}...`);
                    await supabase.from('search_tracking').update({ status: 'scraping' }).eq('id', searchId);

                    // 4. Create Bot Job (v1/jobs)
                    const jobPayload = {
                        name: `Job-${searchId.substring(0, 8)}`,
                        keywords: [rubro],
                        lang: "es",
                        zoom: 14,
                        lat: coords.lat.toString(),
                        lon: coords.lon.toString(),
                        fast_mode: true,
                        radius: 5000,
                        depth: 5,
                        email: false,
                        max_time: 600 // Increased to 10 minutes
                    };

                    const createJobResponse = await axios.post(`${botBaseUrl}/api/v1/jobs`, jobPayload, { httpsAgent });
                    const jobId = createJobResponse.data.id || createJobResponse.data.ID;
                    console.log(`[Background] Job created: ${jobId}`);

                    // 5. Poll for Job Completion
                    let jobStatus = 'pending';
                    let attempts = 0;
                    const maxAttempts = 120; // 10 minutes (5s * 120)

                    while (jobStatus !== 'ok' && jobStatus !== 'completed' && jobStatus !== 'failed' && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        const statusResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}`, { httpsAgent });
                        // Bot API v1 returns capitalized keys: Status, ID
                        jobStatus = statusResponse.data.Status || statusResponse.data.status;
                        console.log(`[Background] Job ${jobId} status: ${jobStatus}`);
                        attempts++;
                    }

                    if (jobStatus === 'failed') throw new Error('Bot job failed');
                    if (jobStatus !== 'ok' && jobStatus !== 'completed') throw new Error('Bot job timed out');

                    // 6. Download Results (CSV)
                    console.log(`[Background] Downloading results for ${jobId}...`);
                    const downloadUrl = `${botBaseUrl}/api/v1/jobs/${jobId}/download`;
                    const csvResponse = await axios.get(downloadUrl, { httpsAgent });
                    const csvContent = csvResponse.data;
                    const newLeads = parseCSV(csvContent);
                    console.log(`[Background] Bot found ${newLeads.length} leads for ${searchId}`);

                    if (newLeads.length > 0) {
                        console.log(`[Background] Parsing ${newLeads.length} leads from CSV...`);

                        // 7. Bulk Upsert in Supabase
                        const leadsToInsert = newLeads.map(l => {
                            // Extract category/rubro
                            const botRubro = l.category || l.category_name || (l.keywords && l.keywords[0]) || l.main_category;

                            // Handle social links and emails
                            let instagram = l.instagram || l.instagram_url || l.ig_url || l.instagram_profile;
                            let facebook = l.facebook || l.facebook_url || l.fb_url || l.facebook_profile;

                            if (l.social_links) {
                                try {
                                    const social = typeof l.social_links === 'string' ? l.social_links : JSON.stringify(l.social_links);
                                    if (social.includes('instagram.com')) {
                                        const match = social.match(/instagram\.com\/[^\s,"]+/);
                                        if (match) instagram = match[0];
                                    }
                                    if (social.includes('facebook.com')) {
                                        const match = social.match(/facebook\.com\/[^\s,"]+/);
                                        if (match) facebook = match[0];
                                    }
                                } catch (e) { }
                            }

                            // If we still don't have it, check other common keys
                            if (!instagram && l.Socials) {
                                try {
                                    const socials = typeof l.Socials === 'string' ? l.Socials : JSON.stringify(l.Socials);
                                    if (socials.includes('instagram.com')) instagram = socials.match(/instagram\.com\/[^\s,"]+/)?.[0];
                                } catch (e) { }
                            }

                            // Email handling: prioritize extended_emails which bot often fills
                            let email = l.extended_emails || l.email;
                            if (!email && l.emails) {
                                email = typeof l.emails === 'string' ? l.emails.split(',')[0] : l.emails[0];
                            }

                            return {
                                nombre: l.title || l.name || l.nombre || 'Nombre Reservado',
                                whatsapp: l.phone || l.whatsapp,
                                web: l.website || l.web,
                                email: email || 'No disponible',
                                place_id: l.place_id || l.id || l.cid || `generated-${Math.random().toString(36).substring(7)}`,
                                direccion: l.address || l.complete_address || l.direccion || 'No disponible',
                                localidad: l.city || l.localidad || localidades[0], // Use searched locality
                                rubro: botRubro || rubro,
                                instagram: instagram || l.instagram || 'No disponible',
                                facebook: facebook || l.facebook || 'No disponible'
                            };
                        });

                        console.log(`[Background] Upserting ${leadsToInsert.length} leads to Free Search Table...`);
                        const { error: upsertError } = await supabase
                            .from('leads_free_search')
                            .upsert(leadsToInsert, { onConflict: 'place_id' });

                        if (upsertError) {
                            console.error('[Background] Upsert error:', upsertError);
                            console.log('[Background] Sample lead for debugging:', JSON.stringify(leadsToInsert[0]));
                        } else {
                            console.log(`[Background] Bulk upsert successful for ${searchId}`);
                        }
                    } else {
                        console.log(`[Background] No leads found in CSV for ${searchId}`);
                    }

                    // 8. Complete
                    console.log(`[Background] Updating search ${searchId} to completed with ${newLeads.length} leads`);
                    const { error: finalStatusError } = await supabase
                        .from('search_tracking')
                        .update({
                            status: 'completed',
                            total_leads: newLeads.length
                        })
                        .eq('id', searchId);

                    if (finalStatusError) console.error('[Background] Error updating final status:', finalStatusError);

                } catch (error: any) {
                    console.error('[Background] CRITICAL ERROR:', error);
                    await supabase.from('search_tracking').update({
                        status: 'error',
                        error_message: error.message
                    }).eq('id', searchId);
                }
            })();

            return NextResponse.json({
                status: 'processing',
                searchId
            });
        }

        // If no results and no searchId (old client or direct call), handle as legacy or return empty
        if (leads.length === 0) {
            return NextResponse.json({ count: 0, leads: [] });
        }

        // Scoring function to prioritize "best" leads (more complete data)
        const getQualityScore = (l: any) => {
            let score = 0;
            if (l.Email || l.email) score += 10;
            if (l.Whatssap || l.whatsapp) score += 10;
            if (l.instagram) score += 5;
            if (l.Direccion || l.direccion) score += 5;
            if (l.Web || l.web) score += 3;
            if (l.Facebook || l.facebook) score += 3;
            return score;
        };

        // Sort by quality so best leads are at the top
        leads.sort((a, b) => getQualityScore(b) - getQualityScore(a));

        // Map and sanitize leads
        const mappedLeads = leads.map((l: any) => ({
            id: l.id || `preview-${Math.random().toString(36).substring(2, 9)}`,
            nombre: l.Nombre || l.nombre || 'Nombre Reservado',
            rubro: l.Rubro || l.rubro || rubro,
            direccion: l.Direccion || l.direccion || 'No disponible',
            localidad: l.Localidad || l.localidad || '',
            provincia: l.Provincia || l.provincia || provincia,
            email: l.Email || l.email || null,
            whatsapp: l.Whatssap || l.whatsapp || null,
            telefono2: l.telefono2 || null,
            web: l.Web || l.web || null,
            instagram: l.instagram || null,
            facebook: l.Facebook || l.facebook || null
        }));

        // Check if full results are requested (post-payment)
        const isFullRequest = req.nextUrl.searchParams.get('full') === 'true';

        if (isFullRequest) {
            return NextResponse.json({
                count: totalCount,
                leads: mappedLeads.map(l => ({ ...l, isWhatsappValid: !!l.whatsapp }))
            });
        }

        // Preview: Mask sensitive data and take top 3
        const previewLeads = mappedLeads.slice(0, 3);
        const maskedLeads = previewLeads.map((lead: any) => ({
            ...lead,
            direccion: lead.direccion === 'No disponible' || !lead.direccion ? 'No disponible' : lead.direccion,
            email: maskEmail(lead.email || ''),
            whatsapp: maskPhone(lead.whatsapp || ''),
            telefono2: maskPhone(lead.telefono2 || ''),
            instagram: maskSocial(lead.instagram || ''),
            facebook: maskSocial(lead.facebook || ''),
            isWhatsappValid: false
        }));

        // Send webhook notification for free search (with totalCount)
        try {
            const searchNotification = {
                tipo: 'consulta_gratis',
                rubro,
                provincia,
                localidades,
                resultados_encontrados: totalCount,
                timestamp: new Date().toISOString()
            };

            const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_SEARCH_WEBHOOK_URL || 'https://n8n-n8n.3htcbh.easypanel.host/webhook-test/lead';

            await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(searchNotification),
            });
        } catch (webhookError) {
            console.error('Error sending search notification webhook:', webhookError);
        }

        return NextResponse.json({
            count: totalCount,
            leads: maskedLeads
        });

    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
