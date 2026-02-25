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

interface DeliverResult {
    ok: boolean;
    message: string;
    deliveredCount?: number;
    dryRun?: boolean;
    debug?: {
        selectedCount: number;
        filename: string;
        localidades: string[];
        filterMode: 'strict' | 'rubro_fallback';
    };
}

interface ProviderSendResult {
    ok: boolean;
    provider: 'resend' | 'n8n_webhook';
    error?: string;
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

function toCsv(rows: LeadRow[]) {
    const headers = [
        'Nombre',
        'Rubro',
        'Direccion',
        'Localidad',
        'Provincia',
        'WhatsApp',
        'Email',
        'Web',
        'Instagram',
        'Facebook',
        'Horario'
    ];

    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const body = rows.map((row) => {
        const values = [
            readString(row, 'Nombre', 'nombre'),
            readString(row, 'Rubro', 'rubro'),
            readString(row, 'Direccion', 'direccion'),
            readString(row, 'Localidad', 'localidad'),
            readString(row, 'Provincia', 'provincia'),
            readString(row, 'Whatssap', 'whatsapp'),
            readString(row, 'Email', 'email'),
            readString(row, 'Web', 'web'),
            readString(row, 'instagram'),
            readString(row, 'Facebook'),
            readString(row, 'Horario', 'horario', 'opening_hours')
        ];

        return values.map(escapeCell).join(';');
    });

    return `\uFEFF${headers.join(';')}\n${body.join('\n')}`;
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
    return { ok: true, provider: 'resend' };
}

async function sendByN8nWebhook(payload: Record<string, unknown>): Promise<ProviderSendResult> {
    const webhook = process.env.N8N_DELIVERY_WEBHOOK_URL;
    if (!webhook) {
        return { ok: false, provider: 'n8n_webhook', error: 'Missing N8N_DELIVERY_WEBHOOK_URL' };
    }

    const response = await fetch(webhook, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `HTTP ${response.status}: ${errorText}`;
        console.error('[Delivery] n8n delivery webhook error:', errorMessage);
        return { ok: false, provider: 'n8n_webhook', error: errorMessage };
    }
    return { ok: true, provider: 'n8n_webhook' };
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

    // 1) Primary attempt: rubro (lowercase column)
    {
        const result = await supabase
            .from('leads_google_maps')
            .select('*')
            .ilike('rubro', `%${order.rubro}%`)
            .limit(searchLimit);
        leadsData = (result.data || []) as LeadRow[];
        leadsError = result.error;
    }

    // 2) Fallback: rubro (capitalized column)
    if (!leadsError && leadsData.length === 0) {
        const result = await supabase
            .from('leads_google_maps')
            .select('*')
            .ilike('Rubro', `%${order.rubro}%`)
            .limit(searchLimit);
        leadsData = (result.data || []) as LeadRow[];
        leadsError = result.error;
    }

    // 3) Last resort: fetch broad sample and filter in code
    if (!leadsError && leadsData.length === 0) {
        const result = await supabase
            .from('leads_google_maps')
            .select('*')
            .limit(searchLimit);
        leadsData = (result.data || []) as LeadRow[];
        leadsError = result.error;
    }

    if (leadsError || !leadsData || leadsData.length === 0) {
        await setDeliveryState(searchId, 'failed', { delivery_error: 'No leads found for order criteria' });
        return { ok: false, message: 'No leads found for order criteria' };
    }

    const normalizedRubro = normalizeText(order.rubro);
    const normalizedLocalidades = localidades.map(normalizeText).filter(Boolean);

    const rubroMatchedLeads = leadsData.filter((lead) => {
        const leadRubro = normalizeText(readString(lead, 'Rubro', 'rubro'));
        const rubroMatch =
            !normalizedRubro ||
            leadRubro.includes(normalizedRubro) ||
            normalizedRubro.includes(leadRubro);

        return rubroMatch;
    });

    const filteredLeads = rubroMatchedLeads.filter((lead) => {
        if (normalizedLocalidades.length === 0) return true;

        const leadLocalidad = normalizeText(readString(lead, 'Localidad', 'localidad'));
        return normalizedLocalidades.some((loc) =>
            leadLocalidad === loc || leadLocalidad.includes(loc) || loc.includes(leadLocalidad)
        );
    });

    // If locality labels differ (e.g. order "Vicente Lopez" but lead locality "Olivos"),
    // do not fail delivery when we still have valid rubro-matched leads.
    const candidateLeads = filteredLeads.length > 0 ? filteredLeads : rubroMatchedLeads;

    if (candidateLeads.length === 0) {
        await setDeliveryState(searchId, 'failed', { delivery_error: 'No leads found for order criteria' });
        return { ok: false, message: 'No leads found for order criteria' };
    }

    const uniqueMap = new Map<string, LeadRow>();
    for (const lead of candidateLeads) {
        const key = readString(lead, 'id') || `${readString(lead, 'Nombre', 'nombre')}|${readString(lead, 'Localidad', 'localidad')}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, lead);
    }

    const selectedLeads = Array.from(uniqueMap.values()).slice(0, Math.max(1, order.quantity_paid));
    const csv = toCsv(selectedLeads);
    const base64Csv = Buffer.from(csv, 'utf-8').toString('base64');
    const filename = `leads_${order.rubro}_${searchId}.csv`.replace(/\s+/g, '_');

    const subject = `Tus leads (${selectedLeads.length}) - ${order.rubro}`;
    const html = `
        <h2>Tus leads están listos</h2>
        <p>Adjuntamos ${selectedLeads.length} contactos de ${order.rubro}.</p>
        <p>Localidades: ${localidades.join(', ') || 'Todas'}</p>
        <p>Monto pagado: ${order.currency} ${order.amount_paid}</p>
    `;

    const filterMode: 'strict' | 'rubro_fallback' = filteredLeads.length > 0 ? 'strict' : 'rubro_fallback';

    if (dryRun) {
        await setDeliveryState(searchId, 'processing', {
            delivery_dry_run_at: new Date().toISOString(),
            delivery_dry_run_count: selectedLeads.length,
            delivery_dry_run_filename: filename,
            locality_filter_mode: filterMode
        });

        return {
            ok: true,
            dryRun: true,
            message: 'Dry run OK: leads found and CSV built',
            deliveredCount: selectedLeads.length,
            debug: {
                selectedCount: selectedLeads.length,
                filename,
                localidades,
                filterMode
            }
        };
    }

    const resendResult = await sendByResend(order.email, subject, html, filename, base64Csv);
    let n8nResult: ProviderSendResult | null = null;

    if (!resendResult.ok) {
        n8nResult = await sendByN8nWebhook({
            searchId,
            email: order.email,
            phone: order.phone,
            filename,
            file_base64: base64Csv,
            rubro: order.rubro,
            localidades,
            quantity: selectedLeads.length,
            amount_paid: order.amount_paid,
            currency: order.currency
        });
    }

    if (!resendResult.ok && !n8nResult?.ok) {
        const details = [
            `resend: ${resendResult.error || 'unknown error'}`,
            `n8n: ${n8nResult?.error || 'not attempted or unknown error'}`
        ].join(' | ');

        await setDeliveryState(searchId, 'failed', {
            delivery_error: 'No email delivery provider configured or delivery failed',
            delivery_provider_errors: details
        });
        return { ok: false, message: `Delivery failed: ${details}` };
    }

    await setDeliveryState(searchId, 'sent', {
        delivery_provider: resendResult.ok ? 'resend' : 'n8n_webhook',
        delivered_count: selectedLeads.length,
        delivered_filename: filename,
        locality_filter_mode: filterMode,
        resend_error: resendResult.ok ? null : resendResult.error || null,
        n8n_delivery_error: n8nResult && !n8nResult.ok ? n8nResult.error || null : null
    });

    return { ok: true, message: 'Delivered successfully', deliveredCount: selectedLeads.length };
}
