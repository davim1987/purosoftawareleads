import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

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
            const payload = {
                tipo: 'consulta_clientepago',
                action: 'deep_scrape',
                searchId: searchId || paymentData.external_reference,
                phone: paymentData.metadata?.client_phone,
                email: paymentData.metadata?.client_email,
                payment_id: paymentData.id,
                monto_pagado: paymentData.transaction_amount,
                cantidad_leads: paymentData.metadata?.quantity || 1,
                rubro: paymentData.metadata?.rubro,
                provincia: paymentData.metadata?.provincia,
                ciudad: paymentData.metadata?.provincia,
                localidades: paymentData.metadata?.localidades,
                status_pago: 'approved',
                source: 'frontend_fallback',
                coordenadas: paymentData.metadata?.coords ? JSON.parse(paymentData.metadata.coords) : null
            };

            const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n-n8n.3htcbh.easypanel.host/webhook-test/lead';

            console.log(`[Payment Fallback] Notifying n8n: ${n8nUrl}`);

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
                    console.error(`[Payment Fallback] n8n failed:`, errorText);
                    return NextResponse.json({ status: 'n8n_error', details: errorText }, { status: 500 });
                }

                console.log('[Payment Fallback] n8n notified successfully');
                return NextResponse.json({ status: 'ok', message: 'Notification sent' });
            } catch (webhookError) {
                console.error('[Payment Fallback] Fetch error calling n8n:', webhookError);
                return NextResponse.json({ error: 'Webhook delivery failed' }, { status: 500 });
            }
        } else {
            return NextResponse.json({ status: 'not_approved', paymentStatus: paymentData.status });
        }

    } catch (error) {
        console.error('[Payment Fallback] Global error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
