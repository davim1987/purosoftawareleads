const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ewhdnpjdttrcjiacrqfd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3aGRucGpkdHRyY2ppYWNycWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc1Nzk4NSwiZXhwIjoyMDc3MzMzOTg1fQ.V4a9vxOsdzoQ1TT_EdflCviAgbAz_cebPFwZOcfpoKk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function dump() {
    console.log("Fetching latest search tracking...");
    const { data, error } = await supabase
        .from('search_tracking')
        .select('id, rubro, status, total_leads, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        fs.writeFileSync('dump_result.json', JSON.stringify({ error }, null, 2));
        return;
    }

    fs.writeFileSync('dump_result.json', JSON.stringify({ data }, null, 2));
    console.log("Done. Saved to dump_result.json");
}

dump();
