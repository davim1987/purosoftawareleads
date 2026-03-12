import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { supabase } from '@/lib/db';
import { checkBotAndUpdateStatus } from '@/lib/search-utils';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const searchId = searchParams.get('id');

        if (!searchId) {
            return NextResponse.json({ error: 'Missing search ID' }, { status: 400 });
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchId);
        let initialData = null;
        let initialError = null;

        if (isUUID) {
            const { data, error } = await supabase
                .from('search_tracking')
                .select('*')
                .eq('id', searchId)
                .single();
            initialData = data;
            initialError = error;
        }

        if (!initialData) {
            if (initialError) console.error('[Status API] Database error for searchId:', searchId, initialError);
            
            // Try fallback to order status if search_tracking not found
            const { data: orderFallback } = await supabase
                .from('orders')
                .select('delivery_status, rubro, localidades')
                .eq('search_id', searchId)
                .maybeSingle();

            if (orderFallback) {
                return NextResponse.json({
                    status: 'processing', // Default status if order exists but tracking doesn't
                    rubro: orderFallback.rubro,
                    localidades: orderFallback.localidades || [],
                    deliveryStatus: orderFallback.delivery_status
                });
            }

            console.log('[Status API] Search record not found for searchId:', searchId);
            return NextResponse.json({ status: 'not_found' });
        }

        // Try to fetch order status separately for better resilience
        const { data: orderData } = await supabase
            .from('orders')
            .select('delivery_status')
            .eq('search_id', searchId)
            .maybeSingle();

        const deliveryStatus = orderData?.delivery_status || 'pending';

        // Active Polling: If not completed/error, check the bot and update
        let currentData = initialData;
        if (initialData.status !== 'completed' && initialData.status !== 'error') {
            const updated = await checkBotAndUpdateStatus(searchId);
            if (updated) currentData = updated;
        }

        return NextResponse.json({
            status: currentData.status,
            error_message: currentData.error_message,
            results: currentData.results,
            count: currentData.total_leads,
            bot_job_id: currentData.bot_job_id,
            rubro: currentData.rubro,
            localidades: currentData.localidad ? currentData.localidad.split(', ') : [],
            deliveryStatus
        });

    } catch (error) {
        console.error('Status API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
