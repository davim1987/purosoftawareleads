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

        const { data: initialData, error: initialError } = await supabase
            .from('search_tracking')
            .select('*')
            .eq('id', searchId)
            .single();

        if (initialError || !initialData) {
            if (initialError) console.error('[Status API] Database error for searchId:', searchId, initialError);
            else console.log('[Status API] Search record not found for searchId:', searchId);
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
