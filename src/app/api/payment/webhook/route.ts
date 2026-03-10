import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { upsertOrder } from '@/lib/orders';
import { startEnrichment } from '@/lib/enrichment';

const getMercadoPagoClient = () => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return null;
    return new MercadoPagoConfig({ accessToken: token });
};

export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const dataId = searchParams.get('data.id') || searchParams.get('id');

        console.log(`[Webhook] Received notification: type=${type}, dataId=${dataId}`);

        if (type === 'payment' && dataId) {
            const client = getMercadoPagoClient();
            if (!client) {
                console.error('[Webhook] Missing MP_ACCESS_TOKEN');
                return NextResponse.json({ error: 'Config error' }, { status: 500 });
            }

            const payment = new Payment(client);
            const paymentData = await payment.get({ id: dataId });

            console.log(`[Webhook] Payment status: ${paymentData.status}, reference: ${paymentData.external_reference}`);

            if (paymentData.status === 'approved') {
                const searchId = paymentData.external_reference;
                if (!searchId) {
                    console.error('[Webhook] Missing external_reference');
                    return NextResponse.json({ ok: false });
                }

                // Update order status
                await upsertOrder({
                    searchId: searchId,
                    paymentStatus: 'approved',
                    deliveryStatus: 'pending',
                    providerPaymentId: String(paymentData.id),
                    source: 'mp_webhook',
                    metadata: {
                        mp_status: paymentData.status,
                        webhook_received_at: new Date().toISOString()
                    }
                });

                // Trigger enrichment
                try {
                    console.log(`[Webhook] Triggering enrichment for ${searchId}`);
                    await startEnrichment(searchId);
                } catch (e) {
                    console.error('[Webhook] Enrichment trigger failed:', e);
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[Webhook] Error:', error);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
