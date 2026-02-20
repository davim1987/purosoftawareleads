import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';

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
        const qty = Number(quantity) || 1;
        const totalAmount = Number(amount);
        const unitPrice = totalAmount / qty;

        const result = await preference.create({
            body: {
                items: [
                    {
                        id: 'lead-purchase',
                        title: 'Compra de Leads',
                        quantity: qty,
                        unit_price: unitPrice,
                        currency_id: 'ARS', // Adjustable based on region
                    },
                ],
                payer: {
                    email: clientEmail || 'comprador@purosoftware.com',
                    phone: {
                        number: clientPhone
                    }
                },
                back_urls: {
                    success: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/?searchId=${finalSearchId}&payment=success`,
                    failure: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/?searchId=${finalSearchId}&payment=failure`,
                    pending: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/?searchId=${finalSearchId}&payment=pending`,
                },
                auto_return: 'approved',
                external_reference: finalSearchId,
                metadata: {
                    client_phone: clientPhone,
                    client_email: clientEmail,
                    quantity: Number(quantity),
                    rubro: rubro,
                    provincia: provincia,
                    localidades: Array.isArray(localidades) ? localidades.join(', ') : localidades,
                    coords: coords ? JSON.stringify(coords) : null
                }
            }
        });

        return NextResponse.json({
            id: result.id,
            init_point: result.init_point
        });

    } catch (error) {
        console.error('Error creating preference:', error);
        return NextResponse.json({ error: 'Error creating preference' }, { status: 500 });
    }
}
