import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
    try {
        // Last 50 leads
        const { data: latestLeads, error: leadError } = await supabase
            .from('leads_free_search')
            .select('id, place_id, nombre, rubro, localidad, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(50);

        // Last 10 searches
        const { data: latestSearches, error: searchError } = await supabase
            .from('search_tracking')
            .select('id, status, rubro, localidad, bot_job_id, total_leads, error_message, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        const latestSearchId = latestSearches?.[0]?.id;
        const { data: leadContacts } = await supabase
            .from('lead_contacts')
            .select('*')
            .eq('search_id', latestSearchId)
            .limit(50);

        const result = {
            count: latestLeads?.length || 0,
            latestLeads,
            latestSearches,
            leadContacts,
            errors: { leadError, searchError }
        };

        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(process.cwd(), 'debug_log.json'), JSON.stringify(result, null, 2));

        return NextResponse.json(result);
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
