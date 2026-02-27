import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { upsertOrder } from '@/lib/orders';
import { deliverOrderBySearchId } from '@/lib/order-delivery';

export async function POST(req: NextRequest) {
    try {
        const expectedSecret = process.env.PY_WORKER_SECRET;
        const authorization = req.headers.get('authorization');

        if (!expectedSecret) {
            console.error('[Enrichment Callback] Missing PY_WORKER_SECRET env variable');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }

        if (authorization !== `Bearer ${expectedSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { job_id, search_id, status, processed, total, error: errorMsg } = body;

        if (!search_id) {
            return NextResponse.json({ error: 'Missing search_id' }, { status: 400 });
        }

        console.log(`[Enrichment Callback] job=${job_id} search=${search_id} status=${status} processed=${processed}/${total}`);

        // Update enrichment_jobs record
        if (job_id) {
            await supabase
                .from('enrichment_jobs')
                .update({
                    status: status === 'done' ? 'done' : 'failed',
                    processed_businesses: processed || 0,
                    error: errorMsg || null,
                    finished_at: new Date().toISOString(),
                })
                .eq('id', job_id);
        }

        // Update search_tracking to 'completed_deep' (frontend compatibility)
        const { error: trackingError } = await supabase
            .from('search_tracking')
            .update({
                status: status === 'done' ? 'completed_deep' : 'failed',
                error_message: status === 'done'
                    ? '¡Listo! Los leads fueron enriquecidos y enviados 🚀'
                    : (errorMsg || 'Enrichment failed'),
            })
            .eq('id', search_id);

        if (trackingError) {
            console.error('[Enrichment Callback] DB Update Error:', trackingError);
        }

        // Update order status
        await upsertOrder({
            searchId: search_id,
            deliveryStatus: status === 'done' ? 'processing' : 'failed',
            source: 'enrichment_callback',
            metadata: {
                enrichment_status: status,
                enrichment_processed: processed || 0,
                enrichment_total: total || 0,
                enrichment_error: errorMsg || null,
            },
        });

        // If enrichment succeeded, trigger delivery
        if (status === 'done') {
            const deliveryResult = await deliverOrderBySearchId(search_id);
            if (!deliveryResult.ok) {
                console.error('[Enrichment Callback] Delivery failed:', deliveryResult.message);
            } else {
                console.log(`[Enrichment Callback] Delivery succeeded: ${deliveryResult.deliveredCount} leads`);

                // Update search_tracking with download token if available
                if (deliveryResult.downloadToken) {
                    await supabase
                        .from('search_tracking')
                        .update({
                            status: 'completed_deep',
                            error_message: '¡Listo! Los leads fueron enriquecidos y enviados 🚀',
                        })
                        .eq('id', search_id);
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Callback processed',
        }, { status: 200 });

    } catch (error) {
        console.error('[Enrichment Callback] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
