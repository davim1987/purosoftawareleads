import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { count: leadCount } = await supabase.from('leads_free_search').select('*', { count: 'exact', head: true });
        const { count: contactCount } = await supabase.from('lead_contacts').select('*', { count: 'exact', head: true });
        const { data: latestLeads } = await supabase.from('leads_free_search').select('id, nombre, rubro, localidad, created_at, updated_at').order('updated_at', { ascending: false }).limit(5);
        const { data: latestContacts } = await supabase.from('lead_contacts').select('business_id, contact_type, normalized_value, created_at').order('created_at', { ascending: false }).limit(5);

        return NextResponse.json({
            leadCount,
            contactCount,
            latestLeads,
            latestContacts
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
