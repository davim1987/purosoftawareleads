import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-api-key');

        // Security check
        if (apiKey !== 'puro-secret-2026') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { searchId, status, message } = body;

        if (!searchId) {
            return NextResponse.json({ error: 'Missing searchId' }, { status: 400 });
        }

        console.log(`[n8n Callback] Received completion for SearchID: ${searchId}`);
        console.log(`Status: ${status} | Message: ${message}`);

        // Update tracking record so the frontend can see the "Leads Sent" status
        const { error } = await supabase
            .from('search_tracking')
            .update({
                status: status || 'completed_deep',
                error_message: message || '¡Listo! Los leads fueron enviados, los contactos son tuyos 🚀'
            })
            .eq('id', searchId);

        if (error) {
            console.error('[n8n Callback] DB Update Error:', error);
            // Return 200 to n8n anyway to prevent unnecessary retries if the logic mostly worked
            return NextResponse.json({ error: 'Database update failed' }, { status: 200 });
        }

        return NextResponse.json({
            success: true,
            message: 'Callback received successfully and DB updated'
        }, { status: 200 });

    } catch (error) {
        console.error('Callback API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
