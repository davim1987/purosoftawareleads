import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        PY_WORKER_URL: process.env.PY_WORKER_URL || 'NOT_SET (Defaulting to http://localhost:8000)',
        PY_WORKER_SECRET_SET: !!process.env.PY_WORKER_SECRET,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
        NODE_ENV: process.env.NODE_ENV
    });
}
