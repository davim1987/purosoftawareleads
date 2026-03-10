import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('search_tracking')
            .select('id, created_at, status, rubro, localidad')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
