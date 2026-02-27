import { NextRequest, NextResponse } from 'next/server';
import { getEnrichmentStatus } from '@/lib/enrichment';

export async function GET(req: NextRequest) {
    try {
        const searchId = req.nextUrl.searchParams.get('searchId');

        if (!searchId) {
            return NextResponse.json({ error: 'Missing searchId' }, { status: 400 });
        }

        const status = await getEnrichmentStatus(searchId);

        return NextResponse.json(status);
    } catch (error) {
        console.error('[Enrichment Status] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
