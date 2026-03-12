import dotenv from 'dotenv';
import path from 'path';

// Load .env.local BEFORE other imports to ensure supabase client gets correct env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { deliverOrderBySearchId } from '../src/lib/order-delivery';

async function run() {
    const searchId = 'c85ecb69-1ec2-4b3c-aeb1-7dd862dc7ca8';
    console.log(`[Test] Triggering delivery for searchId: ${searchId}`);

    try {
        const result = await deliverOrderBySearchId(searchId);
        console.log('[Test] Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('[Test] Error:', error);
    }
}

run();
