import { supabase } from '@/lib/db';

type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled';
type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'failed';

interface UpsertOrderInput {
    searchId: string;
    email?: string | null;
    phone?: string | null;
    rubro?: string | null;
    provincia?: string | null;
    localidades?: string[] | string | null;
    quantityPaid?: number | null;
    amountPaid?: number | null;
    currency?: string | null;
    paymentStatus?: PaymentStatus;
    deliveryStatus?: DeliveryStatus;
    providerPaymentId?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
}

const toLocalidadesArray = (value: UpsertOrderInput['localidades']) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export async function upsertOrder(input: UpsertOrderInput) {
    if (!input.searchId) return;

    const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('search_id', input.searchId)
        .maybeSingle();

    const existingMetadata =
        existing && typeof existing.metadata === 'object' && existing.metadata !== null
            ? (existing.metadata as Record<string, unknown>)
            : {};

    const mergedLocalidades =
        input.localidades !== undefined
            ? toLocalidadesArray(input.localidades)
            : toLocalidadesArray((existing?.localidades as string[] | string | null | undefined) ?? []);

    const payload = {
        search_id: input.searchId,
        email: input.email ?? existing?.email ?? null,
        phone: input.phone ?? existing?.phone ?? null,
        rubro: input.rubro ?? existing?.rubro ?? 'Sin rubro',
        provincia: input.provincia ?? existing?.provincia ?? null,
        localidades: mergedLocalidades,
        quantity_paid: Math.max(1, Number(input.quantityPaid ?? existing?.quantity_paid ?? 1)),
        amount_paid: Number(input.amountPaid ?? existing?.amount_paid ?? 0),
        currency: input.currency ?? existing?.currency ?? 'ARS',
        payment_status: input.paymentStatus ?? existing?.payment_status ?? 'pending',
        delivery_status: input.deliveryStatus ?? existing?.delivery_status ?? 'pending',
        provider_payment_id: input.providerPaymentId ?? existing?.provider_payment_id ?? null,
        source: input.source ?? existing?.source ?? 'web_app',
        metadata: {
            ...existingMetadata,
            ...(input.metadata || {})
        }
    };

    const { error } = await supabase
        .from('orders')
        .upsert(payload, { onConflict: 'search_id' });

    if (error) {
        console.error('[Orders] Upsert error:', error);
    }
}

export async function markOrderDelivered(searchId: string, message?: string) {
    if (!searchId) return;

    const { data: current } = await supabase
        .from('orders')
        .select('metadata')
        .eq('search_id', searchId)
        .maybeSingle();

    const existingMetadata =
        current && typeof current.metadata === 'object' && current.metadata !== null
            ? (current.metadata as Record<string, unknown>)
            : {};

    const { error } = await supabase
        .from('orders')
        .update({
            delivery_status: 'sent',
            delivered_at: new Date().toISOString(),
            metadata: {
                ...existingMetadata,
                callback_message: message || null
            }
        })
        .eq('search_id', searchId);

    if (error) {
        console.error('[Orders] Mark delivered error:', error);
    }
}
