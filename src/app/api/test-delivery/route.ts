import { NextRequest, NextResponse } from 'next/server';
import { deliverOrderBySearchId } from '@/lib/order-delivery';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    const searchId = 'SEARCH-1773167143578-php79rj';
    try {
        console.log(`[Test API] Debugging delivery for searchId: ${searchId}`);
        console.log(`[Test API] RESEND_FROM_EMAIL: ${process.env.RESEND_FROM_EMAIL}`);
        console.log(`[Test API] RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);

        // 1. Force reset to pending
        const { error: resetError } = await supabase
            .from('orders')
            .update({ delivery_status: 'pending' })
            .eq('search_id', searchId);

        if (resetError) {
            console.error('[Test API] Reset error:', resetError);
            return NextResponse.json({ ok: false, error: 'Failed to reset order', details: resetError }, { status: 500 });
        }

        // 2. Verify it's actually reset before continuing
        const { data: verifyData } = await supabase
            .from('orders')
            .select('delivery_status')
            .eq('search_id', searchId)
            .single();

        console.log(`[Test API] Order status after reset: ${verifyData?.delivery_status}`);

        const { data: orderData } = await supabase
            .from('orders')
            .select('email')
            .eq('search_id', searchId)
            .single();

        const result = await deliverOrderBySearchId(searchId);
        return NextResponse.json({
            ...result,
            debug: {
                searchId,
                recipient: orderData?.email,
                statusAfterReset: verifyData?.delivery_status,
                resendEmail: process.env.RESEND_FROM_EMAIL,
                hasApiKey: !!process.env.RESEND_API_KEY
            }
        });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
