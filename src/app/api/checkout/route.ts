import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';
import { upsertOrder } from '@/lib/orders';

const getMercadoPagoClient = () => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return null;
    return new MercadoPagoConfig({ accessToken: token });
};

export async function POST(req: NextRequest) {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return NextResponse.json({ error: 'Missing MP_ACCESS_TOKEN' }, { status: 500 });
        }

        const body = await req.json();
        const { searchId, amount, clientPhone, clientEmail, quantity = 1, rubro, provincia, localidades, coords } = body;

        // Generate searchId server-side if not provided
        const finalSearchId = searchId || `SEARCH-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const preference = new Preference(client);

        const qty = Math.max(1, Number(quantity) || 1);
        const totalAmount = Number(amount);
        // Round to 2 decimals to avoid floating point issues in MP
        const unitPrice = Math.round((totalAmount / qty) * 100) / 100;

        // More robust phone handling: skip if it's just the prefix or empty
        const cleanPhone = clientPhone?.replace(/\D/g, '') || '';
        const hasValidPhone = cleanPhone.length >= 8; // Basic check for AR numbers

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        const preferenceBody = {
            items: [
                {
                    id: 'lead-purchase',
                    title: `Compra de ${qty} leads - ${rubro || 'General'}`,
                    quantity: qty,
                    unit_price: unitPrice,
                    currency_id: 'ARS',
                },
            ],
            payer: {
                email: clientEmail || 'comprador@purosoftware.com',
                ...(hasValidPhone ? { phone: { number: clientPhone } } : {})
            },
            back_urls: {
                success: `${baseUrl}/?searchId=${finalSearchId}&payment=success`,
                failure: `${baseUrl}/?searchId=${finalSearchId}&payment=failure`,
                pending: `${baseUrl}/?searchId=${finalSearchId}&payment=pending`,
            },
            auto_return: 'approved',
            notification_url: process.env.MP_WEBHOOK_URL,
            external_reference: finalSearchId,
            metadata: {
                client_phone: clientPhone,
                client_email: clientEmail,
                quantity: qty,
                rubro: rubro,
                provincia: provincia,
                localidades: Array.isArray(localidades) ? localidades.join(', ') : localidades,
                coords: coords ? JSON.stringify(coords) : null
            }
        };

        console.log('[MercadoPago] Creating preference with body:', JSON.stringify(preferenceBody, null, 2));

        const result = await preference.create({ body: preferenceBody });

        await upsertOrder({
            searchId: finalSearchId,
            email: clientEmail || null,
            phone: clientPhone || null,
            rubro: rubro || null,
            provincia: provincia || null,
            localidades: Array.isArray(localidades) ? localidades : (localidades || null),
            quantityPaid: qty,
            amountPaid: totalAmount,
            paymentStatus: 'pending',
            deliveryStatus: 'pending',
            source: 'checkout_api',
            metadata: {
                preference_id: result.id || null,
                coords: coords || null
            }
        });

        return NextResponse.json({
            id: result.id,
            init_point: result.init_point
        });

    } catch (error: any) {
        // Log the full error to the server console for better debugging
        console.error('Error creating Mercado Pago preference:', error?.message || error);
        if (error?.cause) console.error('Error cause:', error.cause);

        const errorMessage = error?.message?.includes('item.unit_price')
            ? 'Error en el precio de los leads'
            : 'Error al crear la preferencia de pago';

        return NextResponse.json({
            error: errorMessage,
            details: error?.message || 'Unknown error'
        }, { status: 500 });
    }
}
