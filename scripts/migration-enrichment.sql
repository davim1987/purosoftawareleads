-- ============================================================
-- Migration: Enrichment system (replaces n8n deep scrape)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. enrichment_jobs: tracks enrichment processing per search
CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id BIGSERIAL PRIMARY KEY,
    search_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    total_businesses INT DEFAULT 0,
    processed_businesses INT DEFAULT 0,
    error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_search_id ON enrichment_jobs(search_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);

-- 2. lead_sources: URLs found via Brave Search for each business
CREATE TABLE IF NOT EXISTS lead_sources (
    id BIGSERIAL PRIMARY KEY,
    search_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('website', 'instagram', 'facebook', 'linkedin', 'directory', 'other')),
    url TEXT NOT NULL,
    domain TEXT NULL,
    rank INT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_search_id ON lead_sources(search_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_business_id ON lead_sources(business_id);

-- 3. lead_contacts: enriched contact info scraped from websites
CREATE TABLE IF NOT EXISTS lead_contacts (
    id BIGSERIAL PRIMARY KEY,
    search_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    contact_type TEXT NOT NULL
        CHECK (contact_type IN ('phone', 'whatsapp', 'email')),
    raw_value TEXT NOT NULL,
    normalized_value TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT false,
    confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
    source_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, contact_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_search_id ON lead_contacts(search_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_business_id ON lead_contacts(business_id);

-- 4. Add download support columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS csv_storage_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_token UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS download_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_download_token_unique
ON orders(download_token)
WHERE download_token IS NOT NULL;
