import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import axios from 'axios';
import { maskEmail, maskPhone, maskSocial } from '@/lib/utils';
import { getGeolocation, httpsAgent, extractSocialHandle } from '@/lib/search-utils';

type RawDbRow = Record<string, unknown>;

interface SearchRequestBody {
    rubro?: string;
    provincia?: string;
    localidades?: string[];
}

interface LeadResponse {
    id: string;
    nombre: string;
    rubro: string;
    direccion: string;
    localidad: string;
    provincia: string;
    email: string | null;
    whatsapp: string | null;
    web: string | null;
    instagram: string | null;
    facebook: string | null;
    horario: string | null;
}

// Simple in-memory fallback for rate limiting if DB fails
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const readString = (row: RawDbRow, ...keys: string[]): string | null => {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim() !== '') {
            return value;
        }
    }
    return null;
};

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
    } catch {
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
        const body = (await req.json()) as SearchRequestBody;
        const { rubro, provincia, localidades } = body;

        if (!rubro || !localidades || !Array.isArray(localidades) || localidades.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const allowed = await checkRateLimit(ip);
        if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

        let leads: RawDbRow[] = [];
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
                leads = dbLeads as RawDbRow[];
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
                const coordsResults = await Promise.all(localidades.map((loc) => getGeolocation(loc, provincia || '')));

                const validLocs = localidades.filter((_, idx) => coordsResults[idx] !== null);
                const validCoords = coordsResults.filter((c): c is { lat: number; lon: number } => c !== null);

                // Create a mapping of locality name -> coordinates for the webhook
                const validCoordsMap: Record<string, { lat: number; lon: number }> = {};
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
                        lang: 'es',
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
                const actualJobIds = jobResponses
                    .map((response) => {
                        const data = response.data as Record<string, unknown>;
                        const id = data.id ?? data.ID ?? data.job_id;
                        return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
                    })
                    .filter((id): id is string => Boolean(id));
                const botJobIdString = actualJobIds.join(', ');

                console.log(`[Parallel Search] Stored bot job IDs: ${botJobIdString}. Polling will happen in /api/search/status`);

                await supabase.from('search_tracking').update({
                    status: `Procesando (0/${validLocs.length})...`,
                    bot_job_id: botJobIdString
                }).eq('id', searchId);

                return NextResponse.json({ status: 'processing', searchId, coords: validCoordsMap });
            } catch (pErr: unknown) {
                console.error('Parallel initiation error:', pErr);
                const message = pErr instanceof Error ? pErr.message : 'Error launching parallel search';
                return NextResponse.json({ error: message }, { status: 500 });
            }
        }

        // Case: Leads found in DB
        const getQualityScore = (lead: RawDbRow) => {
            let score = 0;
            if (readString(lead, 'Email', 'email')) score += 10;
            if (readString(lead, 'Whatssap', 'whatsapp')) score += 10;
            if (readString(lead, 'instagram')) score += 5;
            return score;
        };
        leads.sort((a, b) => getQualityScore(b) - getQualityScore(a));

        const mappedLeads: LeadResponse[] = leads.map((lead) => {
            const mapped: LeadResponse = {
                id: readString(lead, 'id') || `p-${Math.random()}`,
                nombre: readString(lead, 'Nombre', 'nombre') || 'Nombre Reservado',
                rubro: readString(lead, 'Rubro', 'rubro') || rubro,
                direccion: readString(lead, 'Direccion', 'direccion') || 'No disponible',
                localidad: readString(lead, 'Localidad', 'localidad') || '',
                provincia: readString(lead, 'Provincia', 'provincia') || (provincia || ''),
                email: readString(lead, 'Email', 'email'),
                whatsapp: readString(lead, 'Whatssap', 'whatsapp'),
                web: readString(lead, 'Web', 'web'),
                instagram: readString(lead, 'instagram'),
                facebook: readString(lead, 'Facebook'),
                horario: readString(lead, 'Horario', 'horario', 'opening_hours')
            };

            // Enhance socials for DB leads if missing
            if (!mapped.instagram) mapped.instagram = extractSocialHandle(mapped.web, 'instagram');
            if (!mapped.facebook) mapped.facebook = extractSocialHandle(mapped.web, 'facebook');

            return mapped;
        });

        const isFullRequest = req.nextUrl.searchParams.get('full') === 'true';
        if (isFullRequest) return NextResponse.json({ count: totalCountFromDB, leads: mappedLeads });

        const maskedLeads = mappedLeads.slice(0, 5).map((lead) => ({
            ...lead,
            email: maskEmail(lead.email || ''),
            whatsapp: maskPhone(lead.whatsapp || ''),
            instagram: maskSocial(lead.instagram || ''),
            facebook: maskSocial(lead.facebook || '')
        }));

        return NextResponse.json({ count: totalCountFromDB, leads: maskedLeads });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
