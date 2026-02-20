import { supabase } from '@/lib/db';
import axios from 'axios';
import https from 'https';
import { maskEmail, maskPhone, maskSocial } from '@/lib/utils';

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
        const { data: cached } = await supabase
            .from('geolocalizacion')
            .select('*')
            .eq('localidad', localidad)
            .eq('provincia', provincia)
            .single();

        if (cached) return { lat: cached.latitud || cached.lat, lon: cached.longitud || cached.lon };

        console.log(`Geolocating ${localidad}, ${provincia} via Nominatim...`);
        const provinceFallback = provincia.toLowerCase().includes('gba') ? 'Buenos Aires' : provincia;
        const queries = [
            `${localidad}, ${provincia}, Argentina`,
            `${localidad}, ${provinceFallback}, Argentina`,
            `${localidad}, Argentina`
        ];

        for (const rawQuery of queries) {
            const query = encodeURIComponent(rawQuery);
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
        const { data: trackingData, error: fetchError } = await supabase
            .from('search_tracking')
            .select('*')
            .eq('id', searchId)
            .single();

        const tracking = trackingData as SearchTrackingRow | null;
        if (fetchError || !tracking) return null;

        // Skip if already completed or error
        if (tracking.status === 'completed' || tracking.status === 'error') return tracking;

        const botJobIds = tracking.bot_job_id ? tracking.bot_job_id.split(',').map((id: string) => id.trim()) : [];
        if (botJobIds.length === 0) return tracking;

        const validLocs = tracking.localidad ? tracking.localidad.split(',').map((l: string) => l.trim()) : [];
        const rubro = tracking.rubro;

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

                if (['ok', 'completed', 'success', 'finished', 'done'].includes(jobStatus)) {
                    // Download results
                    const csvResponse = await axios.get(`${botBaseUrl}/api/v1/jobs/${jobId}/download`, { httpsAgent });
                    const partLeads = parseCSV(csvResponse.data);

                    partLeads.forEach((l) => {
                        let mail = l.extended_emails || l.email || l['email address'] || l.emails;
                        if (!mail && l.emails) mail = l.emails.split(',')[0] || 'No disponible';

                        const leadObj: SearchLead = {
                            id: l.place_id || l.id || l.cid || `lead-${Math.random().toString(36).substring(7)}`,
                            nombre: l.title || l.name || l['business name'] || 'Nombre Reservado',
                            whatsapp: l.phone || l.whatsapp || l['phone number'] || l.phone_number || null,
                            web: l.website || l.web || l['website url'] || l.url || null,
                            email: mail || 'No disponible',
                            direccion: l.address || l.complete_address || l['full address'] || l.formatted_address || 'No disponible',
                            localidad: l.city || l.sublocality || currentLoc,
                            rubro: l.category || l.type || rubro,
                            instagram: l.instagram || l['instagram handle'] || 'No disponible',
                            facebook: l.facebook || l['facebook page'] || 'No disponible',
                            horario: l.opening_hours || l.hours || l['business hours'] || 'No disponible'
                        };

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
                    completedCount++;
                } else if (['failed', 'finished', 'done', 'error'].includes(jobStatus)) {
                    completedCount++; // Mark as finished even if failed to continue
                } else {
                    anyRunning = true;
                }
            } catch (jobErr) {
                console.error(`Error checking job ${jobId}:`, jobErr);
                anyRunning = true; // Assume running if check fails to be safe
            }
        }

        // Update DB based on findings
        if (!anyRunning && completedCount === botJobIds.length) {
            // Finalize
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
            // Still processing
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
