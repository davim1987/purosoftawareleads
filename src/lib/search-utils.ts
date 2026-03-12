import { supabase } from '@/lib/db';
import axios from 'axios';
import https from 'https';
import { maskEmail, maskPhone, maskSocial } from '@/lib/utils';
import fs from 'fs';
import path from 'path';

function normalizeText(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function logDebug(msg: string, searchId: string) {
    try {
        const { data: current } = await supabase.from('search_tracking').select('error_message').eq('id', searchId).single();
        const oldMsg = current?.error_message || '';
        const newMsg = `${oldMsg}\n${new Date().toISOString()} - ${msg}`.substring(0, 5000); // Guard limit
        await supabase.from('search_tracking').update({ error_message: newMsg }).eq('id', searchId);
    } catch (e) {
        console.error('Debug log error:', e);
    }
}

type CsvValue = string | null;
type CsvRow = Record<string, CsvValue>;

interface SearchLead {
    id: string;
    nombre: string;
    whatsapp: string | null;
    web: string | null;
    email: string | null;
    direccion: string;
    localidad: string;
    rubro: string;
    instagram: string | null;
    facebook: string | null;
    horario: string | null;
}

interface SearchTrackingRow {
    id: string;
    status: string;
    rubro: string;
    localidad: string | null;
    bot_job_id: string | null;
    provincia?: string | null;
    total_leads?: number | null;
    results?: SearchLead[] | null;
    error_message?: string | null;
}

const allowInsecureBotTLS = process.env.BOT_ALLOW_INSECURE_TLS === 'true';

// Keep strict TLS by default; allow self-signed certs only when explicitly enabled.
export const httpsAgent = new https.Agent({
    rejectUnauthorized: !allowInsecureBotTLS
});

const botBaseUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'https://gmaps-simple-scraper.puro.software';

// Helper for CSV Parsing
export function parseCSV(csvText: string): CsvRow[] {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Detect separator (auto-comma or semi-colon)
    let firstLine = lines[0];
    let startIdx = 1;
    let separator = ',';

    // Handle Excel "sep=;" or "sep=," hint
    if (firstLine.toLowerCase().startsWith('sep=')) {
        separator = firstLine.split('=')[1]?.trim() || ',';
        firstLine = lines[1];
        startIdx = 2;
    } else {
        separator = firstLine.includes(';') && (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    }

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

    const headers = splitCSVLine(firstLine).map(h => h.toLowerCase().trim());
    if (headers.length === 0) return [];

    return lines.slice(startIdx).map((line: string) => {
        const values = splitCSVLine(line);
        const obj: CsvRow = {};
        headers.forEach((header: string, i: number) => {
            if (header) obj[header] = values[i] || null;
        });
        return obj;
    });
}

// Helper for extracting social handles from URLs
export function extractSocialHandle(url: string | null, platform: 'instagram' | 'facebook'): string | null {
    if (!url || typeof url !== 'string') return null;
    if (url === 'null' || url === 'No disponible') return null;

    try {
        let targetUrl = url;
        if (url.includes('u=')) {
            const urlMatch = url.match(/u=([^&]+)/);
            if (urlMatch) targetUrl = decodeURIComponent(urlMatch[1]);
        }

        const isPlatform = targetUrl.toLowerCase().includes(platform);
        const isLinktree = platform === 'instagram' && targetUrl.includes('linktr.ee');

        if (!isPlatform && !isLinktree) return null;

        if (isLinktree && !isPlatform) {
            const parts = targetUrl.split('linktr.ee/')[1];
            if (parts) return '@' + parts.split(/[?#/]/)[0];
        }

        const patterns = {
            instagram: /(?:instagram\.com\/|instagr\.am\/)(?:[^/?#]+\/)?([^/?#]+)/i,
            facebook: /(?:facebook\.com\/|fb\.com\/)(?:pages\/[^/?#]+\/)?(?:[^/?#]+\/)?([^/?#]+)/i
        };

        const match = targetUrl.match(patterns[platform]);
        if (match && match[1]) {
            const handle = match[1].toLowerCase();
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
export async function getGeolocation(localidad: string, provincia: string) {
    try {
        // Clean up provincia: if it's just "Argentina", treat it as empty for cache lookup
        const cleanProvincia = (provincia || '').replace(/(^Argentina|,?\s*Argentina$)/gi, '').trim();
        const provinceFallback = cleanProvincia.toLowerCase().includes('gba') ? 'Buenos Aires' : cleanProvincia;

        // Try cache lookup with locality only if provincia is just "Argentina"
        let query = supabase.from('geolocalizacion').select('*').eq('localidad', localidad);
        if (cleanProvincia && cleanProvincia !== '') {
            query = query.eq('provincia', cleanProvincia);
        }
        
        // Argentina approximate bounding box
        const isInArgentina = (lat: number, lon: number) =>
            lat >= -56 && lat <= -21 && lon >= -74 && lon <= -53;

        const { data: entries } = await query;
        if (entries && entries.length > 0) {
            const cached = entries[0];
            const lat = cached.latitud || cached.lat;
            const lon = cached.longitud || cached.lon;
            if (isInArgentina(lat, lon)) {
                return { lat, lon };
            }
            // Bad cache entry (wrong country), delete it and re-fetch
            console.log(`[Geo] Cached entry for "${localidad}" is outside Argentina (${lat}, ${lon}), deleting and re-fetching`);
            await supabase.from('geolocalizacion').delete().eq('id', cached.id);
        }

        console.log(`Geolocating ${localidad}, ${provincia} via Nominatim...`);

        const queries = cleanProvincia
            ? [
                `${localidad}, ${cleanProvincia}, Argentina`,
                `${localidad}, ${provinceFallback}, Argentina`,
                `${localidad}, Argentina`
            ]
            : [`${localidad}, Argentina`];

        for (const rawQuery of queries) {
            const encodedQuery = encodeURIComponent(rawQuery);
            const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=ar`, {
                headers: { 'User-Agent': 'PurosoftwareBot/1.0' }
            });

            if (response.data && response.data.length > 0) {
                const result = response.data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);

                // Save to cache with the most descriptive info we have
                await supabase.from('geolocalizacion').insert({
                    localidad,
                    provincia: cleanProvincia || 'Argentina',
                    latitud: lat,
                    longitud: lon,
                    partido: result.display_name
                });

                return { lat, lon };
            }
        }
        return null;
    } catch (error) {
        console.error('Geolocation error:', error);
        return null;
    }
}

/**
 * Logic to check bot status and update tracking.
 * This function will be called by GET /api/search/status
 */
export async function checkBotAndUpdateStatus(searchId: string) {
    try {
        await logDebug(`Checking status for searchId: ${searchId}`, searchId);
        const { data: trackingData, error: fetchError } = await supabase
            .from('search_tracking')
            .select('*')
            .eq('id', searchId)
            .single();

        const tracking = trackingData as SearchTrackingRow | null;
        if (fetchError || !tracking) {
            await logDebug(`Fetch error or no tracking found for ${searchId}: ${fetchError?.message}`, searchId);
            return null;
        }

        // Skip if already completed or error
        if (tracking.status === 'completed' || tracking.status === 'error') {
            await logDebug(`Search ${searchId} already finished with status: ${tracking.status}`, searchId);
            return tracking;
        }

        const botJobIds = tracking.bot_job_id ? tracking.bot_job_id.split(',').map((id: string) => id.trim()) : [];
        await logDebug(`Found ${botJobIds.length} job IDs for ${searchId}: ${botJobIds.join(', ')}`, searchId);

        if (botJobIds.length === 0) return tracking;

        const validLocs = tracking.localidad ? tracking.localidad.split(',').map((l: string) => l.trim()) : [];
        const rubro = tracking.rubro;
        const currentProvince = tracking.provincia || 'Buenos Aires';

        const aggregatedLeads: SearchLead[] = [];
        let completedCount = 0;
        let anyRunning = false;

        for (let i = 0; i < botJobIds.length; i++) {
            const jobId = botJobIds[i];
            const currentLoc = validLocs[i] || 'Desconocida';

            try {
                const statusResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}`, {
                    httpsAgent,
                    timeout: 5000
                });

                const jobStatus = (statusResponse.data.Status || statusResponse.data.status || 'pending').toLowerCase();
                await logDebug(`Job ${jobId} status: ${jobStatus}`, searchId);

                if (['ok', 'completed', 'success', 'finished', 'done'].includes(jobStatus)) {
                    // Download results
                    const csvResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}/download`, { httpsAgent });
                    const partLeads = parseCSV(csvResponse.data);
                    await logDebug(`Downloaded ${partLeads.length} leads for job ${jobId}`, searchId);

                    // DEBUG: Log headers to tracking
                    if (partLeads.length > 0) {
                        const headers = Object.keys(partLeads[0]);
                        await logDebug(`Job ${jobId} headers: ${headers.join(', ')}`, searchId);
                    }

                    // Helper for column mapping
                    const findValue = (row: CsvRow, ...altKeys: string[]) => {
                        for (const k of altKeys) {
                            if (row[k] && String(row[k]).trim() !== '' && String(row[k]).toLowerCase() !== 'no disponible' && String(row[k]).toLowerCase() !== 'null') {
                                return String(row[k]).trim();
                            }
                        }
                        return null;
                    };

                    const jobLeadsToInsert = partLeads.map(l => {
                        const pid = l.place_id || l.placeId || l.cid || l.id;
                        const isInternal = !pid || String(pid).startsWith('lead-');

                        const mail = findValue(l, 'extended_emails', 'email', 'emails', 'email address', 'e-mail');
                        const phone = findValue(l, 'phone', 'whatsapp', 'phone number', 'phone_number', 'telefono', 'tel');
                        const website = findValue(l, 'website', 'web', 'website url', 'url', 'site');
                        const instagram = findValue(l, 'instagram', 'instagram handle', 'ig');
                        const facebook = findValue(l, 'facebook', 'facebook page', 'fb');

                        const searchFields = [l.website, l.web, l.webcity, l.emails, l.extended_emails, l.description].filter(Boolean);
                        let ig = instagram || 'No disponible';
                        let fb = facebook || 'No disponible';

                        if (ig === 'No disponible') {
                            for (const f of searchFields) {
                                const h = extractSocialHandle(f, 'instagram');
                                if (h) { ig = h; break; }
                            }
                        }
                        if (fb === 'No disponible') {
                            for (const f of searchFields) {
                                const h = extractSocialHandle(f, 'facebook');
                                if (h) { fb = h; break; }
                            }
                        }

                        const tempId = `temp-${Math.random().toString(36).substring(2, 11)}`;
                        const leadObj: SearchLead = {
                            id: isInternal ? tempId : String(pid),
                            nombre: findValue(l, 'title', 'name', 'business name', 'nombre') || 'Nombre Reservado',
                            whatsapp: phone,
                            web: website,
                            email: mail || 'No disponible',
                            direccion: findValue(l, 'address', 'complete_address', 'full address', 'formatted_address', 'direccion') || 'No disponible',
                            localidad: findValue(l, 'city', 'sublocality', 'neighborhood', 'localidad') || currentLoc,
                            rubro: findValue(l, 'category', 'type', 'rubro', 'sub_category') || rubro,
                            instagram: ig,
                            facebook: fb,
                            horario: findValue(l, 'opening_hours', 'hours', 'business hours', 'horario') || 'No disponible'
                        };

                        // STRICT LOCALITY FILTERING
                        const normalizedLeadLoc = normalizeText(leadObj.localidad);
                        const requestedLocs = validLocs.map(normalizeText);
                        const isRequestedLocMap = requestedLocs.some(loc =>
                            normalizedLeadLoc === loc || normalizedLeadLoc.includes(loc) || loc.includes(normalizedLeadLoc)
                        );

                        if (!isRequestedLocMap) {
                            return null;
                        }

                        aggregatedLeads.push(leadObj);

                        return {
                            place_id: isInternal ? null : String(pid),
                            nombre: leadObj.nombre,
                            rubro: leadObj.rubro,
                            direccion: leadObj.direccion,
                            localidad: leadObj.localidad,
                            provincia: currentProvince,
                            search_id: searchId, // Added this
                            whatsapp: leadObj.whatsapp,
                            email: leadObj.email === 'No disponible' ? null : leadObj.email,
                            web: leadObj.web,
                            instagram: leadObj.instagram === 'No disponible' ? null : leadObj.instagram,
                            facebook: leadObj.facebook === 'No disponible' ? null : leadObj.facebook,
                            updated_at: new Date().toISOString()
                        };
                    }).filter((l): l is NonNullable<typeof l> => l !== null);

                    // INCREMENTAL PERSISTENCE
                    if (jobLeadsToInsert.length > 0) {
                        try {
                            await logDebug(`Starting incremental persistence for ${jobLeadsToInsert.length} leads in job ${jobId}`, searchId);
                            const pIds = jobLeadsToInsert.map(l => l.place_id).filter(Boolean) as string[];
                            const { data: existing } = await supabase
                                .from('leads_free_search')
                                .select('id, place_id, email, whatsapp, web, instagram, facebook')
                                .in('place_id', pIds);

                            const existingMap = new Map(existing?.map(l => [l.place_id, l]));

                            const protectedLeads = jobLeadsToInsert.map(newLead => {
                                const exist = newLead.place_id ? existingMap.get(newLead.place_id) : null;
                                if (!exist) {
                                  // For NEW leads, ensure 'id' is NOT present so the DB generator runs
                                  const { id, ...rest } = newLead as any;
                                  return rest;
                                }

                                const isAv = (val: any) => val && String(val).toLowerCase() !== 'no disponible' && String(val).toLowerCase() !== 'null';
                                return {
                                    ...newLead,
                                    // We can omit 'id' even for updates if we upsert on 'place_id'
                                    // but if we want to be safe, we keep it ONLY for existing ones
                                    id: exist.id, 
                                    email: isAv(newLead.email) ? newLead.email : (exist.email || newLead.email),
                                    whatsapp: isAv(newLead.whatsapp) ? newLead.whatsapp : (exist.whatsapp || newLead.whatsapp),
                                    web: isAv(newLead.web) ? newLead.web : (exist.web || newLead.web),
                                    instagram: isAv(newLead.instagram) ? newLead.instagram : (exist.instagram || newLead.instagram),
                                    facebook: isAv(newLead.facebook) ? newLead.facebook : (exist.facebook || newLead.facebook),
                                };
                            });

                            // Split into leads with place_id and leads without (internal)
                            const withPlaceId = protectedLeads.filter(l => l.place_id);
                            const withoutPlaceId = protectedLeads.filter(l => !l.place_id);

                            if (withPlaceId.length > 0) {
                                const { error: upsertError } = await supabase
                                    .from('leads_free_search')
                                    .upsert(withPlaceId, { onConflict: 'place_id' });

                                if (upsertError) {
                                    await logDebug(`[Incremental] Upsert Error (PlaceId): ${JSON.stringify(upsertError)}`, searchId);
                                    console.error(`[Incremental] Upsert Error for job ${jobId}:`, upsertError);
                                } else {
                                    await logDebug(`[Incremental] Upserted ${withPlaceId.length} leads by place_id`, searchId);
                                }
                            }

                            if (withoutPlaceId.length > 0) {
                                const { error: insertError } = await supabase
                                    .from('leads_free_search')
                                    .insert(withoutPlaceId);

                                if (insertError) {
                                    await logDebug(`[Incremental] Insert Error (Internal): ${JSON.stringify(insertError)}`, searchId);
                                    console.error(`[Incremental] Insert Error for job ${jobId}:`, insertError);
                                } else {
                                    await logDebug(`[Incremental] Inserted ${withoutPlaceId.length} internal leads`, searchId);
                                }
                            }
                        } catch (upsertErr: any) {
                            await logDebug(`[Incremental] Fatal error for job ${jobId}: ${upsertErr.message}`, searchId);
                            console.error(`[Incremental] Fatal error for job ${jobId}:`, upsertErr);
                        }
                    }
                    completedCount++;
                } else if (['failed', 'finished', 'done', 'error'].includes(jobStatus)) {
                    await logDebug(`Job ${jobId} finished with fail status.`, searchId);
                    completedCount++;
                } else {
                    await logDebug(`Job ${jobId} still running.`, searchId);
                    anyRunning = true;
                }
            } catch (jobErr: any) {
                await logDebug(`Error checking job ${jobId}: ${jobErr.message}`, searchId);
                console.error(`Error checking job ${jobId}:`, jobErr);
                anyRunning = true;
            }
        }

        // Finalize search_tracking
        if (!anyRunning && completedCount === botJobIds.length) {
            if (aggregatedLeads.length > 0) {
                const getScore = (l: SearchLead) => {
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

                const { data: updated } = await supabase.from('search_tracking').update({
                    status: 'completed',
                    total_leads: aggregatedLeads.length,
                    results: topLeads
                }).eq('id', searchId).select().single();
                return updated;
            } else {
                const { data: updated } = await supabase.from('search_tracking').update({
                    status: 'completed',
                    total_leads: 0,
                    results: []
                }).eq('id', searchId).select().single();
                return updated;
            }
        } else {
            const newStatus = `Procesando (${completedCount}/${botJobIds.length})...`;
            if (tracking.status !== newStatus) {
                await supabase.from('search_tracking').update({ status: newStatus }).eq('id', searchId);
            }
            return { ...tracking, status: newStatus };
        }
    } catch (err) {
        console.error('checkBotAndUpdateStatus error:', err);
        return null;
    }
}
