const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://ewhdnpjdttrcjiacrqfd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3aGRucGpkdHRyY2ppYWNycWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc1Nzk4NSwiZXhwIjoyMDc3MzMzOTg1fQ.V4a9vxOsdzoQ1TT_EdflCviAgbAz_cebPFwZOcfpoKk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: latestSearches } = await supabase
        .from('search_tracking')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!latestSearches || latestSearches.length === 0) {
        console.log("No searches found");
        return;
    }

    const s = latestSearches[0];
    console.log(`Latest Search: ${s.id} | Rubro: ${s.rubro} | Status: ${s.status}`);

    const { data: leads } = await supabase
        .from('leads_free_search')
        .select('id, nombre, rubro, email, whatsapp')
        .eq('rubro', s.rubro)
        .limit(10);

    const { data: contacts } = await supabase
        .from('lead_contacts')
        .select('*')
        .eq('search_id', s.id);

    const result = {
        search: s,
        leads_count: leads?.length || 0,
        leads,
        contacts_count: contacts?.length || 0,
        contacts
    };

    fs.writeFileSync('test_db_res.json', JSON.stringify(result, null, 2));
    console.log("Written to test_db_res.json");
}

check();
