import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('provincias')
            .select('id, provincia')
            .in('id', [1, 2]);

        if (error) {
            console.error('Error fetching provincias:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error in provinces API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
