import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(req: NextRequest) {
    const tables = [
        'leads_free_search',
        'search_tracking',
        'orders',
        'enrichment_jobs',
        'lead_contacts',
        'lead_sources'
    ];

    const results: Record<string, string[]> = {};

    for (const table of tables) {
        try {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (error) {
                results[table] = [('Error: ' + error.message)];
            } else if (data && data.length > 0) {
                results[table] = Object.keys(data[0]);
            } else {
                results[table] = ['Table is empty (cannot detect columns)'];
            }
        } catch (e) {
            results[table] = [('Exception: ' + String(e))];
        }
    }

    return NextResponse.json(results);
}
