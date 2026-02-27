import { supabase } from '@/lib/db';

const PY_WORKER_URL = process.env.PY_WORKER_URL || 'http://localhost:8000';
const PY_WORKER_SECRET = process.env.PY_WORKER_SECRET || '';
const ENRICHMENT_BATCH_SIZE = Number(process.env.ENRICHMENT_BATCH_SIZE || 20);
const ENRICHMENT_MAX_RETRIES = Number(process.env.ENRICHMENT_MAX_RETRIES || 3);

interface Business {
    id: string;
    name: string;
    locality: string;
    provincia: string | null;
    existing_website: string | null;
    existing_phone: string | null;
    existing_email: string | null;
}

interface EnrichmentJob {
    id: number;
    search_id: string;
    status: 'pending' | 'processing' | 'done' | 'failed';
    attempts: number;
    total_businesses: number;
    processed_businesses: number;
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
}

interface EnrichmentStatus {
    status: 'pending' | 'processing' | 'done' | 'failed' | 'not_found';
    jobId: number | null;
    processed: number;
    total: number;
    error: string | null;
    finishedAt: string | null;
    downloadToken: string | null;
}

interface StartEnrichmentResult {
    jobId: number;
    ok: boolean;
    skipped?: boolean;
    message?: string;
}

function normalizeText(value: string | null | undefined) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function readString(obj: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }
    return '';
}

function toArrayOfStrings(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string').map(s => s.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * Fetch businesses from leads_google_maps for a given order's search criteria.
 * Mirrors the query logic from order-delivery.ts.
 */
export async function fetchBusinessesForEnrichment(searchId: string): Promise<Business[]> {
    const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('search_id', searchId)
        .maybeSingle();

    if (!orderData) {
        console.error(`[Enrichment] No order found for searchId=${searchId}`);
        return [];
    }

    const rubro = orderData.rubro as string;
    const localidades = toArrayOfStrings(orderData.localidades);
    const searchLimit = Math.max(Number(orderData.quantity_paid || 1) * 30, 500);

    // Primary: lowercase rubro column
    let { data: leadsData, error } = await supabase
        .from('leads_google_maps')
        .select('*')
        .ilike('rubro', `%${rubro}%`)
        .limit(searchLimit);

    // Fallback: capitalized Rubro column
    if (!error && (!leadsData || leadsData.length === 0)) {
        const result = await supabase
            .from('leads_google_maps')
            .select('*')
            .ilike('Rubro', `%${rubro}%`)
            .limit(searchLimit);
        leadsData = result.data;
        error = result.error;
    }

    if (error || !leadsData || leadsData.length === 0) {
        console.log(`[Enrichment] No leads found for rubro="${rubro}"`);
        return [];
    }

    // Filter by localidad
    const normalizedLocalidades = localidades.map(normalizeText).filter(Boolean);
    const filtered = leadsData.filter((lead) => {
        if (normalizedLocalidades.length === 0) return true;
        const leadLocalidad = normalizeText(readString(lead as Record<string, unknown>, 'Localidad', 'localidad'));
        return normalizedLocalidades.some(loc =>
            leadLocalidad === loc || leadLocalidad.includes(loc) || loc.includes(leadLocalidad)
        );
    });

    const candidates = filtered.length > 0 ? filtered : leadsData;

    // Deduplicate
    const uniqueMap = new Map<string, Record<string, unknown>>();
    for (const lead of candidates) {
        const rec = lead as Record<string, unknown>;
        const key = readString(rec, 'id') || `${readString(rec, 'Nombre', 'nombre')}|${readString(rec, 'Localidad', 'localidad')}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, rec);
    }

    const uniqueLeads = Array.from(uniqueMap.values()).slice(0, ENRICHMENT_BATCH_SIZE);

    return uniqueLeads.map((lead) => ({
        id: readString(lead, 'id') || `${readString(lead, 'Nombre', 'nombre')}_${readString(lead, 'Localidad', 'localidad')}`,
        name: readString(lead, 'Nombre', 'nombre'),
        locality: readString(lead, 'Localidad', 'localidad'),
        provincia: readString(lead, 'Provincia', 'provincia') || null,
        existing_website: readString(lead, 'Web', 'web') || null,
        existing_phone: readString(lead, 'Whatssap', 'whatsapp') || null,
        existing_email: readString(lead, 'Email', 'email') || null,
    }));
}

/**
 * Start enrichment for a search. Creates job record and calls the Python worker.
 * Idempotent: skips if a job already exists in 'processing' or 'done' state.
 */
export async function startEnrichment(searchId: string): Promise<StartEnrichmentResult> {
    // Idempotency guard
    const { data: existing } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('search_id', searchId)
        .in('status', ['processing', 'done'])
        .limit(1);

    if (existing && existing.length > 0) {
        const job = existing[0] as EnrichmentJob;
        console.log(`[Enrichment] Job already ${job.status} for searchId=${searchId}, skipping`);
        return { jobId: job.id, ok: true, skipped: true, message: `Job already ${job.status}` };
    }

    // Check retry limit on failed jobs
    const { data: failedJobs } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('search_id', searchId)
        .eq('status', 'failed');

    if (failedJobs && failedJobs.length >= ENRICHMENT_MAX_RETRIES) {
        console.error(`[Enrichment] Max retries (${ENRICHMENT_MAX_RETRIES}) exceeded for searchId=${searchId}`);
        return { jobId: 0, ok: false, message: 'Max retries exceeded' };
    }

    // Fetch businesses
    const businesses = await fetchBusinessesForEnrichment(searchId);

    if (businesses.length === 0) {
        console.log(`[Enrichment] No businesses to enrich for searchId=${searchId}`);
        return { jobId: 0, ok: false, message: 'No businesses found for enrichment' };
    }

    // Create job record
    const { data: jobData, error: jobError } = await supabase
        .from('enrichment_jobs')
        .insert({
            search_id: searchId,
            status: 'pending',
            total_businesses: businesses.length,
        })
        .select('id')
        .single();

    if (jobError || !jobData) {
        console.error('[Enrichment] Failed to create job record:', jobError);
        return { jobId: 0, ok: false, message: 'Failed to create enrichment job' };
    }

    const jobId = jobData.id as number;

    // Call Python worker
    try {
        const workerUrl = `${PY_WORKER_URL}/enrich`;
        console.log(`[Enrichment] Calling worker at ${workerUrl} for job ${jobId} with ${businesses.length} businesses`);

        const response = await fetch(workerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PY_WORKER_SECRET}`,
            },
            body: JSON.stringify({
                job_id: jobId,
                search_id: searchId,
                businesses,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker returned ${response.status}: ${errorText}`);
        }

        // Update job to processing
        await supabase
            .from('enrichment_jobs')
            .update({
                status: 'processing',
                started_at: new Date().toISOString(),
                attempts: (failedJobs?.length || 0) + 1,
            })
            .eq('id', jobId);

        console.log(`[Enrichment] Worker accepted job ${jobId}`);
        return { jobId, ok: true };

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Enrichment] Worker call failed for job ${jobId}:`, errorMsg);

        await supabase
            .from('enrichment_jobs')
            .update({
                status: 'failed',
                error: errorMsg,
                finished_at: new Date().toISOString(),
                attempts: (failedJobs?.length || 0) + 1,
            })
            .eq('id', jobId);

        return { jobId, ok: false, message: errorMsg };
    }
}

/**
 * Get the latest enrichment status for a search_id.
 */
export async function getEnrichmentStatus(searchId: string): Promise<EnrichmentStatus> {
    const { data: jobs } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })
        .limit(1);

    if (!jobs || jobs.length === 0) {
        return {
            status: 'not_found',
            jobId: null,
            processed: 0,
            total: 0,
            error: null,
            finishedAt: null,
            downloadToken: null,
        };
    }

    const job = jobs[0] as EnrichmentJob;

    // If done, also fetch the download token from orders
    let downloadToken: string | null = null;
    if (job.status === 'done') {
        const { data: order } = await supabase
            .from('orders')
            .select('download_token')
            .eq('search_id', searchId)
            .maybeSingle();
        downloadToken = (order?.download_token as string) || null;
    }

    return {
        status: job.status,
        jobId: job.id,
        processed: job.processed_businesses,
        total: job.total_businesses,
        error: job.error,
        finishedAt: job.finished_at,
        downloadToken,
    };
}
