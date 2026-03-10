const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
const envPath = path.resolve(__dirname, '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const searchId = '102d7c92-7d7f-4497-a76b-4a9fb1e3fcef';

async function checkOrder() {
    console.log(`[Debug] Checking order: ${searchId}`);
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('search_id', searchId)
        .maybeSingle();

    if (error) {
        console.error('[Debug] Error fetching order:', error);
        return;
    }

    if (!data) {
        console.log('[Debug] Order not found');
        return;
    }

    console.log('[Debug] Order Data:');
    console.log(JSON.stringify(data, null, 2));
}

checkOrder();
