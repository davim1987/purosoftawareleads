import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    const searchId = '102d7c92-7d7f-4497-a76b-4a9fb1e3fcef';
    try {
        const { error } = await supabase
            .from('orders')
            .update({ delivery_status: 'pending' })
            .eq('search_id', searchId);

        if (error) throw error;

        return NextResponse.json({ ok: true, message: `Reset order ${searchId} to pending` });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
