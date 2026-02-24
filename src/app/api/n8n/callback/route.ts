import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { upsertOrder } from '@/lib/orders';
import { deliverOrderBySearchId } from '@/lib/order-delivery';

export async function POST(req: NextRequest) {
    try {
        const expectedApiKey = process.env.N8N_CALLBACK_API_KEY;
        const apiKey = req.headers.get('x-api-key');

        if (!expectedApiKey) {
            console.error('[n8n Callback] Missing N8N_CALLBACK_API_KEY env variable');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }

        // Security check
        if (apiKey !== expectedApiKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { searchId, status, message } = body;

        if (!searchId) {
            return NextResponse.json({ error: 'Missing searchId' }, { status: 400 });
        }

        console.log(`[n8n Callback] Received completion for SearchID: ${searchId}`);
        console.log(`Status: ${status} | Message: ${message}`);

        // Update tracking record so the frontend can see the "Leads Sent" status
        const { error } = await supabase
            .from('search_tracking')
            .update({
                status: status || 'completed_deep',
                error_message: message || '¡Listo! Los leads fueron enviados, los contactos son tuyos 🚀'
            })
            .eq('id', searchId);

        if (error) {
            console.error('[n8n Callback] DB Update Error:', error);
            // Return 200 to n8n anyway to prevent unnecessary retries if the logic mostly worked
            return NextResponse.json({ error: 'Database update failed' }, { status: 200 });
        }

        await upsertOrder({
            searchId,
            deliveryStatus: status === 'failed' ? 'failed' : 'processing',
            source: 'n8n_callback',
            metadata: {
                callback_status: status || 'completed_deep',
                callback_message: message || null
            }
        });

        if (status !== 'failed') {
            const deliveryResult = await deliverOrderBySearchId(searchId);
            if (!deliveryResult.ok) {
                console.error('[n8n Callback] Delivery failed:', deliveryResult.message);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Callback received successfully and DB updated'
        }, { status: 200 });

    } catch (error) {
        console.error('Callback API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
