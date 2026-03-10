import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { data, error } = await supabase
            .from('leads_free_search')
            .select('*')
            .limit(1);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

        return NextResponse.json({
            table: 'leads_free_search',
            columns,
            sample: data[0] || null
        });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
