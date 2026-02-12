import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const searchId = searchParams.get('id');

        if (!searchId) {
            return NextResponse.json({ error: 'Missing search ID' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('search_tracking')
            .select('*')
            .eq('id', searchId)
            .single();

        if (error || !data) {
            return NextResponse.json({ status: 'not_found' });
        }

        return NextResponse.json({
            status: data.status,
            error_message: data.error_message,
            results: data.results,
            count: data.total_leads,
            bot_job_id: data.bot_job_id
        });

    } catch (error) {
        console.error('Status API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
