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
        const type = body.type || (body.action?.includes('payment') ? 'payment' : null);
        const data = body.data;

        console.log(`[MP Webhook] Incoming: type=${type}, action=${body.action}`, body);

        if (!process.env.MP_ACCESS_TOKEN) {
            console.error('[MP Webhook] CRITICAL: MP_ACCESS_TOKEN is missing in environment variables');
            return NextResponse.json({ status: 'ignored_missing_config' }, { status: 200 });
        }

        if (type === 'payment') {
            const client = getMercadoPagoClient();
            if (!client) {
                return NextResponse.json({ status: 'ignored_missing_config' }, { status: 200 });
            }
            const payment = new Payment(client);
            let paymentData;

            const paymentId = data?.id || body.resource?.split('/').pop();

            if (!paymentId) {
                console.error('[MP Webhook] No payment ID found in body');
                return NextResponse.json({ error: 'No ID' }, { status: 200 });
            }

            try {
                paymentData = await payment.get({ id: paymentId });
                console.log(`[MP Webhook] Payment data retrieved for ID ${paymentId}: status=${paymentData.status}`);
            } catch (pError) {
                console.error(`[MP Webhook] Error fetching payment data for ID ${paymentId}:`, pError);
                return NextResponse.json({ error: 'Error fetching payment data' }, { status: 200 }); // Always 200 to MP
            }

            if (paymentData.status === 'approved') {
                const finalSearchId = paymentData.external_reference;

                if (finalSearchId) {
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
                        source: 'mp_webhook',
                        metadata: {
                            mp_status: paymentData.status || null
                        }
                    });

                    // Trigger enrichment (replaces n8n deep scrape)
                    try {
                        const result = await startEnrichment(finalSearchId);
                        console.log(`[MP Webhook] Enrichment: jobId=${result.jobId}, ok=${result.ok}, skipped=${result.skipped || false}`);

                        if (!result.ok && result.message === 'No businesses found for enrichment') {
                            console.log('[MP Webhook] No businesses for enrichment, triggering direct delivery');
                            const { deliverOrderBySearchId } = await import('@/lib/order-delivery');
                            await deliverOrderBySearchId(finalSearchId);
                        } else if (result.ok) {
                            await upsertOrder({
                                searchId: finalSearchId,
                                deliveryStatus: 'processing',
                                source: 'mp_webhook',
                                metadata: {
                                    enrichment_job_id: result.jobId,
                                    enrichment_queue_status: result.skipped ? 'skipped_existing' : 'queued'
                                }
                            });
                        } else {
                            await upsertOrder({
                                searchId: finalSearchId,
                                deliveryStatus: 'pending',
                                source: 'mp_webhook',
                                metadata: {
                                    enrichment_queue_error: result.message || 'unknown queue error'
                                }
                            });
                        }
                    } catch (enrichError) {
                        console.error('[MP Webhook] Enrichment trigger failed:', enrichError);
                        await upsertOrder({
                            searchId: finalSearchId,
                            deliveryStatus: 'pending',
                            source: 'mp_webhook',
                            metadata: {
                                enrichment_queue_error: enrichError instanceof Error ? enrichError.message : String(enrichError)
                            }
                        });
                    }
                }
            } else {
                const fallbackSearchId = paymentData.external_reference;
                if (fallbackSearchId) {
                    await upsertOrder({
                        searchId: fallbackSearchId,
                        paymentStatus: 'pending',
                        deliveryStatus: 'pending',
                        providerPaymentId: paymentData.id ? String(paymentData.id) : null,
                        source: 'mp_webhook',
                        metadata: {
                            mp_status: paymentData.status || null
                        }
                    });
                }
                console.log(`[MP Webhook] Payment not approved yet (status: ${paymentData.status}) for ID ${data.id}`);
            }
        }

        return NextResponse.json({ status: 'ok' }, { status: 200 });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
