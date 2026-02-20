import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import axios from 'axios';
import { maskEmail, maskPhone, maskSocial } from '@/lib/utils';
import { getGeolocation, httpsAgent, extractSocialHandle } from '@/lib/search-utils';

// Simple in-memory fallback for rate limiting if DB fails
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

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

                // 2. Launch Jobs and store IDs (No more background polling here!)
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
                        depth: 2,
                        max_time: 400
                    };
                    return axios.post(`${botBaseUrl}/api/v1/jobs`, payload, { httpsAgent });
                });

                const jobResponses = await Promise.all(jobRequests);
                const actualJobIds = jobResponses.map(r => r.data.id || r.data.ID || r.data.job_id).filter(Boolean);
                const botJobIdString = actualJobIds.join(', ');

                console.log(`[Parallel Search] Stored bot job IDs: ${botJobIdString}. Polling will happen in /api/search/status`);

                await supabase.from('search_tracking').update({
                    status: `Procesando (0/${validLocs.length})...`,
                    bot_job_id: botJobIdString
                }).eq('id', searchId);

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
