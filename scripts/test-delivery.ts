import { deliverOrderBySearchId } from '../src/lib/order-delivery';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const searchId = 'SEARCH-1773167143578-php79rj';
    console.log(`[Test] Triggering delivery for searchId: ${searchId}`);

    try {
        const result = await deliverOrderBySearchId(searchId);
        console.log('[Test] Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('[Test] Error:', error);
    }
}

run();
