import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const provinciaId = searchParams.get('provincia_id');

        if (!provinciaId) {
            return NextResponse.json({ error: 'Missing provincia_id' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('localidades')
            .select('localidad, zona')
            .eq('id_provincia', provinciaId)
            .order('zona')
            .order('localidad');

        if (error) {
            console.error('Error fetching localidades:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error in localities API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
