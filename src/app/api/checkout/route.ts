import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { searchId, amount, clientPhone, clientEmail, quantity = 1, rubro, provincia, localidades } = body;

        // Generate searchId server-side if not provided
        const finalSearchId = searchId || `SEARCH-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [
                    {
                        id: 'lead-purchase',
                        title: 'Compra de Leads',
                        quantity: Number(quantity),
                        unit_price: Number(amount),
                        currency_id: 'ARS', // Adjustable based on region
                    },
                ],
                payer: {
                    email: clientEmail,
                    phone: {
                        number: clientPhone
                    }
                },
                back_urls: {
                    success: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/success`,
                    failure: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/failure`,
                    pending: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/pending`,
                },
                auto_return: 'approved',
                external_reference: finalSearchId,
                metadata: {
                    client_phone: clientPhone,
                    client_email: clientEmail,
                    quantity: Number(quantity),
                    rubro: rubro,
                    provincia: provincia,
                    localidades: Array.isArray(localidades) ? localidades.join(', ') : localidades
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
