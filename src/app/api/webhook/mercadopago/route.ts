import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, data } = body;

        if (type === 'payment') {
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: data.id });

            if (paymentData.status === 'approved') {
                const payload = {
                    tipo: 'consulta_clientepago',
                    action: 'deep_scrape',
                    searchId: paymentData.external_reference,
                    phone: paymentData.metadata.client_phone,
                    email: paymentData.metadata.client_email,
                    payment_id: paymentData.id,
                    monto_pagado: paymentData.transaction_amount,
                    cantidad_leads: paymentData.metadata.quantity || 1,
                    rubro: paymentData.metadata.rubro,
                    provincia: paymentData.metadata.provincia,
                    ciudad: paymentData.metadata.provincia, // Adding explicit 'ciudad' field
                    localidades: paymentData.metadata.localidades,
                    status_pago: 'approved'
                };

                const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n-n8n.3htcbh.easypanel.host/webhook-test/lead';

                console.log(`Sending webhook to n8n: ${n8nUrl} for searchId: ${payload.searchId}`);

                try {
                    const response = await fetch(n8nUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        console.error('Failed to notify n8n webhook:', response.statusText);
                    } else {
                        console.log('Successfully notified n8n webhook');
                    }
                } catch (webhookError) {
                    console.error('Error calling n8n webhook:', webhookError);
                }
            }
        }

        return NextResponse.json({ status: 'ok' }, { status: 200 });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
