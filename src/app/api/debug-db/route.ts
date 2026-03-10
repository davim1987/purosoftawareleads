import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const searchId = searchParams.get('id') || '23d22216-3ef5-429b-8a9c-3e3a13d1c144';

    const { data: tracking, error: trackingErr } = await supabase
        .from('search_tracking')
        .select('*')
        .eq('id', searchId)
        .single();

    let jobData = null;
    if (tracking && tracking.bot_job_id) {
        const firstJobId = tracking.bot_job_id.split(',')[0].trim();
        try {
            const botBaseUrl = 'https://gmaps-simple-scraper.puro.software';
            const statusRes = await fetch(`${botBaseUrl}/api/v1/jobs/${firstJobId}`);
            const status = await statusRes.json();

            let csvHead = null;
            if (status.status === 'success' || status.Status === 'success') {
                const downloadRes = await fetch(`${botBaseUrl}/api/v1/jobs/${firstJobId}/download`);
                const text = await downloadRes.text();
                csvHead = text.split('\n').slice(0, 3).join('\n');
            }

            jobData = { status, csvHead };
        } catch (e) {
            jobData = { error: String(e) };
        }
    }

    return NextResponse.json({
        searchId,
        tracking,
        jobData
    });
}
