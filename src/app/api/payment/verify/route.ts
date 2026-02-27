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
        const body = await req.json();
        const { paymentId, searchId } = body;

        console.log(`[Payment Fallback] Verifying paymentId=${paymentId} for searchId=${searchId}`);

        if (!paymentId) {
            return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
        }

        if (!process.env.MP_ACCESS_TOKEN) {
            console.error('[Payment Fallback] CRITICAL: MP_ACCESS_TOKEN is missing');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }

        const client = getMercadoPagoClient();
        if (!client) {
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }

        const payment = new Payment(client);
        let paymentData;

        try {
            paymentData = await payment.get({ id: paymentId });
            console.log(`[Payment Fallback] Payment data status: ${paymentData.status}`);
        } catch (pError) {
            console.error(`[Payment Fallback] Error fetching payment data:`, pError);
            return NextResponse.json({ error: 'Payment not found or error fetching' }, { status: 404 });
        }

        if (paymentData.status === 'approved') {
            const finalSearchId = searchId || paymentData.external_reference;

            if (!finalSearchId) {
                console.error('[Payment Fallback] Missing searchId/external_reference for approved payment');
                return NextResponse.json({ error: 'Missing search reference' }, { status: 400 });
            }

            await upsertOrder({
                searchId: finalSearchId,
                email: paymentData.metadata?.client_email || null,
                phone: paymentData.metadata?.client_phone || null,
                rubro: paymentData.metadata?.rubro || null,
                provincia: paymentData.metadata?.provincia || null,
                localidades: paymentData.metadata?.localidades || null,
                quantityPaid: Number(paymentData.metadata?.quantity || 1),
                amountPaid: Number(paymentData.transaction_amount || 0),
                paymentStatus: 'approved',
                deliveryStatus: 'pending',
                providerPaymentId: paymentData.id ? String(paymentData.id) : null,
                source: 'payment_verify',
                metadata: {
                    mp_status: paymentData.status || null
                }
            });

            // Trigger enrichment (replaces n8n deep scrape)
            try {
                const result = await startEnrichment(finalSearchId);
                console.log(`[Payment Fallback] Enrichment: jobId=${result.jobId}, ok=${result.ok}, skipped=${result.skipped || false}`);

                if (!result.ok && result.message === 'No businesses found for enrichment') {
                    console.log('[Payment Fallback] No businesses for enrichment, triggering direct delivery');
                    const { deliverOrderBySearchId } = await import('@/lib/order-delivery');
                    await deliverOrderBySearchId(finalSearchId);
                    return NextResponse.json({ status: 'delivery_triggered_no_enrichment' });
                }

                if (result.ok) {
                    await upsertOrder({
                        searchId: finalSearchId,
                        deliveryStatus: 'processing',
                        source: 'payment_verify',
                        metadata: {
                            enrichment_job_id: result.jobId,
                            enrichment_queue_status: result.skipped ? 'skipped_existing' : 'queued'
                        }
                    });
                    return NextResponse.json({ status: 'enrichment_queued', jobId: result.jobId });
                }

                await upsertOrder({
                    searchId: finalSearchId,
                    deliveryStatus: 'pending',
                    source: 'payment_verify',
                    metadata: {
                        enrichment_queue_error: result.message || 'unknown queue error'
                    }
                });
                return NextResponse.json({ status: 'enrichment_trigger_failed', message: result.message || 'Enrichment trigger failed' }, { status: 200 });
            } catch (enrichError) {
                console.error('[Payment Fallback] Enrichment trigger failed:', enrichError);
                await upsertOrder({
                    searchId: finalSearchId,
                    deliveryStatus: 'pending',
                    source: 'payment_verify',
                    metadata: {
                        enrichment_queue_error: enrichError instanceof Error ? enrichError.message : String(enrichError)
                    }
                });
                return NextResponse.json({ status: 'enrichment_trigger_failed', message: 'Enrichment trigger failed' }, { status: 200 });
            }
        } else {
            const fallbackSearchId = searchId || paymentData.external_reference;
            if (fallbackSearchId) {
                await upsertOrder({
                    searchId: fallbackSearchId,
                    paymentStatus: 'pending',
                    deliveryStatus: 'pending',
                    providerPaymentId: paymentData.id ? String(paymentData.id) : null,
                    source: 'payment_verify',
                    metadata: {
                        mp_status: paymentData.status || null
                    }
                });
            }
            return NextResponse.json({ status: 'not_approved', paymentStatus: paymentData.status });
        }

    } catch (error) {
        console.error('[Payment Fallback] Global error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
