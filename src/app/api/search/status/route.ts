import { NextRequest, NextResponse } from 'next/server';
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
            return NextResponse.json({ status: 'not_found' });
        }

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
            localidades: currentData.localidad ? currentData.localidad.split(', ') : []
        });

    } catch (error) {
        console.error('Status API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
