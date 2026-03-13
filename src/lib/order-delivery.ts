import { supabase } from '@/lib/db';

type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'failed';

interface OrderRow {
    search_id: string;
    email: string | null;
    phone: string | null;
    rubro: string;
    provincia: string | null;
    localidades: unknown;
    quantity_paid: number;
    amount_paid: number;
    currency: string;
    payment_status: string;
    delivery_status: DeliveryStatus;
    metadata: Record<string, unknown> | null;
}

interface LeadRow {
    id?: string;
    Nombre?: string;
    nombre?: string;
    Rubro?: string;
    rubro?: string;
    Direccion?: string;
    direccion?: string;
    Localidad?: string;
    localidad?: string;
    Provincia?: string;
    provincia?: string;
    Whatssap?: string;
    whatsapp?: string;
    Email?: string;
    email?: string;
    Web?: string;
    web?: string;
    instagram?: string;
    Facebook?: string;
    Horario?: string;
    horario?: string;
    opening_hours?: string;
    [key: string]: unknown;
}

interface EnrichedLeadRow extends LeadRow {
    enriched_phone?: string;
    enriched_email?: string;
    enriched_email2?: string;
    enriched_whatsapp?: string;
    enriched_website?: string;
    enriched_instagram?: string;
    enriched_facebook?: string;
    enriched_linkedin?: string;
}

interface DeliverResult {
    ok: boolean;
    message: string;
    deliveredCount?: number;
    downloadToken?: string;
    dryRun?: boolean;
    resendId?: string;
    debug?: {
        selectedCount: number;
        filename: string;
        localidades: string[];
        filterMode: 'strict' | 'rubro_fallback';
    };
}

interface ProviderSendResult {
    ok: boolean;
    provider: 'resend';
    error?: string;
    resendId?: string;
}

interface EnrichmentData {
    emails: string[];
    phones: string[];
    whatsapps: string[];
    sources: { type: string; url: string }[];
}

function normalizeText(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toArrayOfStrings(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

function readString(obj: LeadRow, ...keys: string[]) {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }
    return '';
}

function toCsv(rows: EnrichedLeadRow[]) {
    const headers = [
        'Nombre',
        'Rubro',
        'Direccion',
        'Localidad',
        'Provincia',
        'WhatsApp',
        'Telefono',
        'Email',
        'Email2',
        'Web',
        'Instagram',
        'Facebook',
        'LinkedIn',
        'Horario'
    ];

    const escapeCell = (value: string) => {
        // Clean up common "empty" indicators from the DB to make the CSV look better
        const cleanValue = (value || '').trim();
        if (
            cleanValue.toLowerCase() === 'no disponible' ||
            cleanValue.toLowerCase() === 'n/a' ||
            cleanValue === '-'
        ) {
            return '""';
        }
        return `"${cleanValue.replace(/"/g, '""')}"`;
    };

    const body = rows.map((row) => {
        const baseWhatsApp = readString(row, 'whatsapp');
        const basePhone = readString(row, 'telefono', 'Telefono');
        const baseEmail = readString(row, 'email', 'Email');
        const baseWeb = readString(row, 'web', 'Web');
        const baseIG = readString(row, 'instagram', 'Instagram');
        const baseFB = readString(row, 'facebook', 'Facebook');

        const values = [
            readString(row, 'nombre', 'Nombre'),
            readString(row, 'rubro', 'Rubro'),
            readString(row, 'direccion', 'Direccion'),
            readString(row, 'localidad', 'Localidad'),
            readString(row, 'provincia', 'Provincia'),
            row.enriched_whatsapp || baseWhatsApp,
            row.enriched_phone || basePhone,
            row.enriched_email || baseEmail,
            row.enriched_email2 || '',
            row.enriched_website || baseWeb,
            row.enriched_instagram || baseIG,
            row.enriched_facebook || baseFB,
            row.enriched_linkedin || '',
            readString(row, 'horario', 'Horario', 'opening_hours')
        ];

        return values.map(escapeCell).join(';');
    });

    // Added 'sep=;' so Excel detects the separator automatically in any region
    const csvContent = `sep=;\n${headers.join(';')}\n${body.join('\n')}`;
    return `\ufeff${csvContent}`;
}

async function setDeliveryState(searchId: string, deliveryStatus: DeliveryStatus, metadataPatch: Record<string, unknown>) {
    const { data: current } = await supabase
        .from('orders')
        .select('metadata')
        .eq('search_id', searchId)
        .maybeSingle();

    const currentMetadata =
        current && typeof current.metadata === 'object' && current.metadata !== null
            ? (current.metadata as Record<string, unknown>)
            : {};

    const patch: Record<string, unknown> = {
        delivery_status: deliveryStatus,
        metadata: {
            ...currentMetadata,
            ...metadataPatch
        }
    };

    if (deliveryStatus === 'sent') {
        patch.delivered_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('orders')
        .update(patch)
        .eq('search_id', searchId);

    if (error) {
        console.error('[Delivery] Error updating order delivery state:', error);
    }
}

async function sendByResend(to: string, subject: string, html: string, filename: string, base64Content: string): Promise<ProviderSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
        return { ok: false, provider: 'resend', error: 'Missing RESEND_API_KEY or RESEND_FROM_EMAIL' };
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
            attachments: [
                {
                    filename,
                    content: base64Content
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('[Delivery] Resend error:', errorMessage);
        return { ok: false, provider: 'resend', error: errorMessage };
    }
    const resendData = await response.json();
    console.log('[Delivery] Resend success, message ID:', resendData.id);
    return { ok: true, provider: 'resend', resendId: resendData.id };
}

/**
 * Fetch enrichment data (contacts + sources) for the given search_id,
 * grouped by business_id.
 */
/**
 * Fetch enrichment data (contacts + sources) for a list of business IDs,
 * grouped by business_id.
 */
async function fetchEnrichmentDataByBusinessIds(businessIds: string[]): Promise<Map<string, EnrichmentData>> {
    const map = new Map<string, EnrichmentData>();
    if (businessIds.length === 0) return map;

    const [contactsResult, sourcesResult] = await Promise.all([
        supabase.from('lead_contacts').select('*').in('business_id', businessIds),
        supabase.from('lead_sources').select('*').in('business_id', businessIds),
    ]);

    const contacts = (contactsResult.data || []) as Array<{
        business_id: string;
        contact_type: string;
        normalized_value: string;
        is_valid: boolean;
    }>;

    const sources = (sourcesResult.data || []) as Array<{
        business_id: string;
        source_type: string;
        url: string;
    }>;

    for (const contact of contacts) {
        if (!map.has(contact.business_id)) {
            map.set(contact.business_id, { emails: [], phones: [], whatsapps: [], sources: [] });
        }
        const entry = map.get(contact.business_id)!;

        if (contact.contact_type === 'email' && contact.is_valid) {
            entry.emails.push(contact.normalized_value);
        } else if (contact.contact_type === 'phone' && contact.is_valid) {
            entry.phones.push(contact.normalized_value);
        } else if (contact.contact_type === 'whatsapp' && contact.is_valid) {
            entry.whatsapps.push(contact.normalized_value);
        }
    }

    for (const source of sources) {
        if (!map.has(source.business_id)) {
            map.set(source.business_id, { emails: [], phones: [], whatsapps: [], sources: [] });
        }
        map.get(source.business_id)!.sources.push({
            type: source.source_type,
            url: source.url,
        });
    }

    return map;
}

/**
 * Merge enriched data into a lead row. Prefers enriched data over base data.
 */
function mergeLeadWithEnrichment(lead: LeadRow, enrichment: EnrichmentData | undefined): EnrichedLeadRow {
    const enriched: EnrichedLeadRow = { ...lead };

    if (!enrichment) return enriched;

    // Emails: first enriched email as primary, second as email2
    if (enrichment.emails.length > 0) {
        enriched.enriched_email = enrichment.emails[0];
    }
    if (enrichment.emails.length > 1) {
        enriched.enriched_email2 = enrichment.emails[1];
    }

    // Phones
    if (enrichment.phones.length > 0) {
        enriched.enriched_phone = enrichment.phones[0];
    }

    // WhatsApp: prefer enriched whatsapp over base
    if (enrichment.whatsapps.length > 0) {
        enriched.enriched_whatsapp = enrichment.whatsapps[0];
    }

    // Sources
    for (const source of enrichment.sources) {
        if (source.type === 'website') enriched.enriched_website = source.url;
        if (source.type === 'instagram') enriched.enriched_instagram = source.url;
        if (source.type === 'facebook') enriched.enriched_facebook = source.url;
        if (source.type === 'linkedin') enriched.enriched_linkedin = source.url;
    }

    return enriched;
}

interface DeliverOptions {
    dryRun?: boolean;
}

export async function deliverOrderBySearchId(searchId: string, options: DeliverOptions = {}): Promise<DeliverResult> {
    const dryRun = Boolean(options.dryRun);

    const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('search_id', searchId)
        .maybeSingle();

    if (orderError || !orderData) {
        return { ok: false, message: 'Order not found' };
    }

    const order = orderData as OrderRow;

    if (order.payment_status !== 'approved') {
        return { ok: false, message: 'Order is not approved' };
    }

    if (order.delivery_status === 'sent') {
        return { ok: true, message: 'Order already delivered' };
    }

    if (!order.email) {
        await setDeliveryState(searchId, 'failed', { delivery_error: 'Missing email in order' });
        return { ok: false, message: 'Missing email in order' };
    }

    await setDeliveryState(searchId, 'processing', { delivery_started_at: new Date().toISOString() });

    const localidades = toArrayOfStrings(order.localidades);
    const searchLimit = Math.max(order.quantity_paid * 30, 500);

    let leadsData: LeadRow[] = [];
    let leadsError: unknown = null;

    // 0) Absolute Primary: lookup by search_id (guaranteed match for new leads)
    {
        const result = await supabase
            .from('leads_free_search')
            .select('*')
            .eq('search_id', searchId)
            .limit(searchLimit);
        leadsData = (result.data || []) as LeadRow[];
        leadsError = result.error;
    }

    // Fallbacks if search_id yields nothing (for legacy leads or direct DB hits)
    if (!leadsError && leadsData.length === 0) {
        // 1) Primary Fallback: Accent-insensitive RPC search
        const { data: rpcLeads, error: rpcError } = await supabase
            .rpc('search_leads_unaccented', {
                query_text: order.rubro,
                localities_array: localidades,
                table_name: 'leads_free_search'
            });

        if (!rpcError && rpcLeads && rpcLeads.length > 0) {
            leadsData = rpcLeads as LeadRow[];
        } else {
            // 2) Traditional Fallback: rubro (lowercase column)
            const result = await supabase
                .from('leads_free_search')
                .select('*')
                .textSearch('rubro', order.rubro, { config: 'spanish', type: 'websearch' })
                .limit(searchLimit);
            leadsData = (result.data || []) as LeadRow[];
            leadsError = result.error;

            // 3) Fallback: ilike (handles accents)
            if (!leadsError && leadsData.length === 0) {
                const result3 = await supabase
                    .from('leads_free_search')
                    .select('*')
                    .ilike('rubro', `%${order.rubro}%`)
                    .limit(searchLimit);
                leadsData = (result3.data || []) as LeadRow[];
                leadsError = result3.error;
            }
        }

        // Last resort removed: never fetch leads without rubro/locality filters
    }

    if (leadsError || !leadsData || leadsData.length === 0) {
        await setDeliveryState(searchId, 'failed', { delivery_error: 'No leads found for order criteria' });
        return { ok: false, message: 'No leads found for order criteria' };
    }

    const normalizedRubro = normalizeText(order.rubro);
    const normalizedLocalidades = localidades.map(normalizeText).filter(Boolean);

    const rubroMatchedLeads = leadsData.filter((lead) => {
        const leadRubro = normalizeText(readString(lead, 'rubro', 'Rubro'));
        const rubroMatch =
            !normalizedRubro ||
            leadRubro.includes(normalizedRubro) ||
            normalizedRubro.includes(leadRubro);

        return rubroMatch;
    });

    const filteredLeads = rubroMatchedLeads.filter((lead) => {
        if (normalizedLocalidades.length === 0) return true;

        const leadLocalidad = normalizeText(readString(lead, 'localidad', 'Localidad'));
        return normalizedLocalidades.some((loc) =>
            leadLocalidad === loc || leadLocalidad.includes(loc) || loc.includes(leadLocalidad)
        );
    });

    // STRICT: Only use leads that match the requested localities.
    // No fallback to unfiltered leads - prevents mixing wrong localities.
    const candidateLeads = filteredLeads;

    if (candidateLeads.length === 0) {
        await setDeliveryState(searchId, 'failed', { delivery_error: 'No leads match requested localities' });
        return { ok: false, message: 'No leads found for requested localities' };
    }

    const uniqueMap = new Map<string, LeadRow>();
    for (const lead of candidateLeads) {
        // Use consistent separator '_' for fallback lead IDs
        // Use consistent separator '_' for fallback lead IDs
        const key = readString(lead, 'id') || `${readString(lead, 'nombre', 'Nombre')}_${readString(lead, 'localidad', 'Localidad')}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, lead);
    }

    // Sort unique leads only by score initially (to preserve global ranking for fallbacks)
    const allUniqueLeads = Array.from(uniqueMap.values()).sort((a, b) => {
        const scoreA = (readString(a, 'email', 'Email') ? 2 : 0) +
            (readString(a, 'whatsapp', 'telefono', 'Telefono') ? 2 : 0) +
            (readString(a, 'web', 'Web') ? 1 : 0) +
            (readString(a, 'instagram', 'facebook', 'Facebook') ? 1 : 0);

        const scoreB = (readString(b, 'email', 'Email') ? 2 : 0) +
            (readString(b, 'whatsapp', 'telefono', 'Telefono') ? 2 : 0) +
            (readString(b, 'web', 'Web') ? 1 : 0) +
            (readString(b, 'instagram', 'facebook', 'Facebook') ? 1 : 0);

        return scoreB - scoreA;
    });

    // Balanced selection logic (Surtido)
    const quantityToDeliver = Math.max(1, order.quantity_paid);
    const selectedLeads: LeadRow[] = [];
    const leadsByLocality = new Map<string, LeadRow[]>();
    
    // Group sorted leads by locality
    for (const lead of allUniqueLeads) {
        const loc = normalizeText(readString(lead, 'localidad', 'Localidad')) || 'sin_localidad';
        if (!leadsByLocality.has(loc)) leadsByLocality.set(loc, []);
        leadsByLocality.get(loc)!.push(lead);
    }

    const availableLocs = Array.from(leadsByLocality.keys());
    
    // Step 1: Round-robin 1 per locality, guaranteeing each zone gets at least 1 contact
    const pickedIds = new Set<string>();
    for (const loc of availableLocs) {
        if (selectedLeads.length >= quantityToDeliver) break;
        const pool = leadsByLocality.get(loc)!;
        if (pool.length > 0) {
            const lead = pool[0]; // Best quality (already sorted by score)
            const id = readString(lead, 'id') || `${readString(lead, 'nombre', 'Nombre')}_${readString(lead, 'localidad', 'Localidad')}`;
            selectedLeads.push(lead);
            pickedIds.add(id);
        }
    }

    // Step 2: Fill remaining slots from best available leads across all localities
    let remainingCount = quantityToDeliver - selectedLeads.length;
    if (remainingCount > 0) {
        for (const lead of allUniqueLeads) {
            if (remainingCount <= 0) break;
            const id = readString(lead, 'id') || `${readString(lead, 'nombre', 'Nombre')}_${readString(lead, 'localidad', 'Localidad')}`;
            if (!pickedIds.has(id)) {
                selectedLeads.push(lead);
                pickedIds.add(id);
                remainingCount--;
            }
        }
    }

    // Fetch enrichment data globally by business IDs
    const businessIds = selectedLeads.map(l => readString(l, 'id')).filter(Boolean);
    const enrichmentMap = await fetchEnrichmentDataByBusinessIds(businessIds);
    const enrichedLeads: EnrichedLeadRow[] = selectedLeads.map((lead) => {
        const leadId = readString(lead, 'id') || `${readString(lead, 'Nombre', 'nombre')}_${readString(lead, 'Localidad', 'localidad')}`;
        return mergeLeadWithEnrichment(lead, enrichmentMap.get(leadId));
    });

    const csv = toCsv(enrichedLeads);
    const base64Csv = Buffer.from(csv, 'utf-8').toString('base64');
    const filename = `leads_${order.rubro}_${searchId}.csv`.replace(/\s+/g, '_');

    const subject = `Tus leads (${enrichedLeads.length}) - ${order.rubro}`;
    const html = `
        <h2>Tus leads están listos</h2>
        <p>Adjuntamos ${enrichedLeads.length} contactos de ${order.rubro}.</p>
        <p>Localidades: ${localidades.join(', ') || 'Todas'}</p>
        <p>Monto pagado: ${order.currency} ${order.amount_paid}</p>
    `;

    const filterMode: 'strict' | 'rubro_fallback' = filteredLeads.length > 0 ? 'strict' : 'rubro_fallback';

    // Generate download token for direct CSV download
    const downloadToken = crypto.randomUUID();
    const downloadExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    if (dryRun) {
        await setDeliveryState(searchId, 'processing', {
            delivery_dry_run_at: new Date().toISOString(),
            delivery_dry_run_count: enrichedLeads.length,
            delivery_dry_run_filename: filename,
            locality_filter_mode: filterMode
        });

        return {
            ok: true,
            dryRun: true,
            message: 'Dry run OK: leads found and CSV built',
            deliveredCount: enrichedLeads.length,
            debug: {
                selectedCount: enrichedLeads.length,
                filename,
                localidades,
                filterMode
            }
        };
    }

    console.log(`[Delivery] Sending email to: ${order.email} using Resend...`);
    const resendResult = await sendByResend(order.email, subject, html, filename, base64Csv);
    console.log(`[Delivery] Resend result:`, JSON.stringify(resendResult));

    if (!resendResult.ok) {
        console.error('[Delivery] Resend failed, CSV still available for direct download');
    }

    // Store CSV for direct download regardless of email result
    await supabase
        .from('orders')
        .update({
            csv_storage_key: base64Csv,
            download_token: downloadToken,
            download_expires_at: downloadExpiresAt,
        })
        .eq('search_id', searchId);

    if (!resendResult.ok) {
        // Email failed but download is available
        await setDeliveryState(searchId, 'sent', {
            delivery_provider: 'download_only',
            delivery_error: resendResult.error || null,
            delivered_count: enrichedLeads.length,
            delivered_filename: filename,
            locality_filter_mode: filterMode,
            download_token: downloadToken,
        });

        return {
            ok: true,
            message: 'Email delivery failed but CSV is available for download',
            deliveredCount: enrichedLeads.length,
            downloadToken,
        };
    }

    await setDeliveryState(searchId, 'sent', {
        delivery_provider: 'resend',
        delivered_count: enrichedLeads.length,
        delivered_filename: filename,
        locality_filter_mode: filterMode,
        download_token: downloadToken,
    });

    return { ok: true, message: 'Delivered successfully', deliveredCount: enrichedLeads.length, downloadToken, resendId: resendResult.resendId };
}
