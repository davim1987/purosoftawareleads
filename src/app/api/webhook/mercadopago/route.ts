import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const type = body.type || (body.action?.includes('payment') ? 'payment' : null);
        const data = body.data;

        console.log(`[MP Webhook] Incoming: type=${type}, action=${body.action}`, body);

        if (!process.env.MP_ACCESS_TOKEN) {
            console.error('[MP Webhook] CRITICAL: MP_ACCESS_TOKEN is missing in environment variables');
        }

        if (type === 'payment') {
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
                const payload = {
                    tipo: 'consulta_clientepago',
                    action: 'deep_scrape',
                    searchId: paymentData.external_reference,
                    phone: paymentData.metadata?.client_phone,
                    email: paymentData.metadata?.client_email,
                    payment_id: paymentData.id,
                    monto_pagado: paymentData.transaction_amount,
                    cantidad_leads: paymentData.metadata?.quantity || 1,
                    rubro: paymentData.metadata?.rubro,
                    provincia: paymentData.metadata?.provincia,
                    ciudad: paymentData.metadata?.provincia,
                    localidades: paymentData.metadata?.localidades,
                    status_pago: 'approved'
                };

                const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n-n8n.3htcbh.easypanel.host/webhook-test/lead';

                console.log(`[MP Webhook] Sending payload to n8n: ${n8nUrl}`, JSON.stringify(payload, null, 2));

                try {
                    const response = await fetch(n8nUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`[MP Webhook] n8n Webhook failed with status ${response.status}:`, errorText);
                    } else {
                        console.log('[MP Webhook] Successfully notified n8n webhook');
                    }
                } catch (webhookError) {
                    console.error('[MP Webhook] Fetch error calling n8n:', webhookError);
                }
            } else {
                console.log(`[MP Webhook] Payment not approved yet (status: ${paymentData.status}) for ID ${data.id}`);
            }
        }

        return NextResponse.json({ status: 'ok' }, { status: 200 });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
