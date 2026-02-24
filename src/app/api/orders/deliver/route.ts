import { NextRequest, NextResponse } from 'next/server';
import { deliverOrderBySearchId } from '@/lib/order-delivery';

interface DeliverBody {
    searchId?: string;
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as DeliverBody;
        const searchId = body.searchId;

        if (!searchId) {
            return NextResponse.json({ error: 'Missing searchId' }, { status: 400 });
        }

        const result = await deliverOrderBySearchId(searchId);
        if (!result.ok) {
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[Orders Deliver API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
