import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { searchId, status, message } = body;

        console.log(`[n8n Callback] Process finished for SearchID: ${searchId}`);
        console.log(`Status: ${status}`);
        console.log(`Message: ${message}`);

        // Here you could update a database table to mark the search as completed
        // or trigger a server-side event if using WebSockets/SSE.

        return NextResponse.json({
            success: true,
            message: 'Callback received successfully'
        }, { status: 200 });

    } catch (error) {
        console.error('Callback API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
