import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-api-key');

        // Security check
        if (apiKey !== 'puro-secret-2026') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { searchId, status, message } = body;

        console.log(`[n8n Callback] Received completion for SearchID: ${searchId}`);
        console.log(`Status: ${status} | Message: ${message}`);

        // In the next step, we will use this searchId to update a "searches" table 
        // that the frontend can poll.

        return NextResponse.json({
            success: true,
            message: 'Callback received successfully and verified'
        }, { status: 200 });

    } catch (error) {
        console.error('Callback API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
