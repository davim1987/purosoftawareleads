const { deliverOrderBySearchId } = require('../src/lib/order-delivery');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function run() {
    const searchId = '102d7c92-7d7f-4497-a76b-4a9fb1e3fcef';
    console.log(`[Test] Triggering delivery for searchId: ${searchId}`);

    try {
        const result = await deliverOrderBySearchId(searchId);
        console.log('[Test] Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('[Test] Error:', error);
    }
}

run();
