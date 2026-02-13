import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, data } = body;

        console.log(`[MP Webhook] Received notification type: ${type}`, body);

        if (type === 'payment') {
            const payment = new Payment(client);
            let paymentData;

            try {
                paymentData = await payment.get({ id: data.id });
                console.log(`[MP Webhook] Payment data retrieved for ID ${data.id}: status=${paymentData.status}`);
            } catch (pError) {
                console.error(`[MP Webhook] Error fetching payment data for ID ${data.id}:`, pError);
                return NextResponse.json({ error: 'Error fetching payment data' }, { status: 500 });
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
