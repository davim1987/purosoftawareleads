import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const token = req.nextUrl.searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 400 });
        }

        const { data: order, error } = await supabase
            .from('orders')
            .select('search_id, rubro, csv_storage_key, download_token, download_expires_at')
            .eq('download_token', token)
            .maybeSingle();

        if (error || !order) {
            return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 404 });
        }

        // Check expiration
        if (order.download_expires_at) {
            const expiresAt = new Date(order.download_expires_at as string);
            if (expiresAt < new Date()) {
                return NextResponse.json({ error: 'Download link has expired' }, { status: 410 });
            }
        }

        const base64Csv = order.csv_storage_key as string;
        if (!base64Csv) {
            return NextResponse.json({ error: 'CSV not yet available' }, { status: 404 });
        }

        const csvContent = Buffer.from(base64Csv, 'base64');
        const rubro = (order.rubro as string || 'leads').replace(/\s+/g, '_');
        const filename = `leads_${rubro}_${order.search_id}.csv`;

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'private, no-cache',
            },
        });
    } catch (error) {
        console.error('[Download] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
