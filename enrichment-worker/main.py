import os
import asyncio
import traceback
from urllib.parse import urlparse
from typing import Optional
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel
from supabase import create_client

from brave_search import search_business
from normalizer import (
    compute_confidence,
    normalize_email,
    normalize_phone,
    normalize_whatsapp,
)
from scraper import scrape_url

load_dotenv()

app = FastAPI(title="Lead Enrichment Worker")

PY_WORKER_SECRET = os.getenv("PY_WORKER_SECRET", "")
CALLBACK_URL = os.getenv("CALLBACK_URL", "http://localhost:3000/api/enrichment/callback")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# --- Models ---

class Business(BaseModel):
    id: str
    name: str
    locality: str
    provincia: Optional[str] = None
    existing_website: Optional[str] = None
    existing_phone: Optional[str] = None
    existing_email: Optional[str] = None


class EnrichRequest(BaseModel):
    job_id: int
    search_id: str
    businesses: list[Business]


# --- Auth ---

def verify_auth(authorization: str = Header(...)):
    expected = f"Bearer {PY_WORKER_SECRET}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# --- Endpoints ---

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/enrich", status_code=202)
async def enrich(
    request: EnrichRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(...),
):
    verify_auth(authorization)
    background_tasks.add_task(process_enrichment, request)
    return {"status": "accepted", "job_id": request.job_id}


# --- Background Processing ---

async def process_enrichment(request: EnrichRequest):
    """Main enrichment loop: Brave search + scrape + normalize + store + callback."""
    job_id = request.job_id
    search_id = request.search_id
    total = len(request.businesses)
    processed = 0

    print(f"[Worker] Starting enrichment job {job_id} for search {search_id} ({total} businesses)")

    try:
        for business in request.businesses:
            try:
                await enrich_single_business(search_id, business)
            except Exception as e:
                print(f"[Worker] Error enriching business '{business.name}': {e}")
                traceback.print_exc()

            processed += 1

            # Update progress in DB
            if supabase:
                supabase.table("enrichment_jobs").update({
                    "processed_businesses": processed,
                }).eq("id", job_id).execute()

        # Mark job as done
        if supabase:
            supabase.table("enrichment_jobs").update({
                "status": "done",
                "processed_businesses": processed,
                "finished_at": now_iso(),
            }).eq("id", job_id).execute()

        # Callback to Next.js
        await send_callback(job_id, search_id, "done", processed, total)
        print(f"[Worker] Job {job_id} completed: {processed}/{total} businesses enriched")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        print(f"[Worker] Job {job_id} failed: {error_msg}")
        traceback.print_exc()

        if supabase:
            supabase.table("enrichment_jobs").update({
                "status": "failed",
                "error": error_msg[:500],
                "processed_businesses": processed,
                "finished_at": now_iso(),
            }).eq("id", job_id).execute()

        await send_callback(job_id, search_id, "failed", processed, total, error_msg)


async def enrich_single_business(search_id: str, business: Business):
    """Enrich a single business: search Brave, scrape URLs, store results."""
    if not supabase:
        print("[Worker] No Supabase client configured, skipping DB operations")
        return

    # 1. Search Brave for website + social media URLs
    brave_results = await search_business(business.name, business.locality)

    urls_to_scrape = []

    # Store website source
    if brave_results["website"]:
        _store_source(search_id, business.id, "website", brave_results["website"])
        urls_to_scrape.append(brave_results["website"])

    # Store social media sources
    for social in brave_results["social_urls"]:
        _store_source(search_id, business.id, social["type"], social["url"])

    # Also scrape existing website if provided and different from Brave result
    if business.existing_website:
        existing_domain = _extract_domain(business.existing_website)
        brave_domain = _extract_domain(brave_results["website"] or "")
        if existing_domain and existing_domain != brave_domain:
            urls_to_scrape.append(business.existing_website)

    # 2. Scrape each URL for contacts
    for url in urls_to_scrape[:3]:  # Cap at 3 URLs per business
        try:
            contacts = await scrape_url(url)

            # Store emails
            for raw_email in contacts["emails"]:
                normalized, is_valid = normalize_email(raw_email)
                confidence = compute_confidence("email", is_valid, url)
                _store_contact(
                    search_id, business.id, "email",
                    raw_email, normalized, is_valid, confidence, url,
                )

            # Store phones
            for raw_phone in contacts["phones"]:
                normalized, is_valid = normalize_phone(raw_phone)
                confidence = compute_confidence("phone", is_valid, url)
                _store_contact(
                    search_id, business.id, "phone",
                    raw_phone, normalized, is_valid, confidence, url,
                )

            # Store WhatsApp numbers
            for raw_wa in contacts["whatsapps"]:
                normalized, is_valid = normalize_whatsapp(raw_wa)
                confidence = compute_confidence("whatsapp", is_valid, url)
                _store_contact(
                    search_id, business.id, "whatsapp",
                    raw_wa, normalized, is_valid, confidence, url,
                )

        except Exception as e:
            print(f"[Worker] Error scraping {url}: {e}")

    # Small delay to avoid hammering servers
    await asyncio.sleep(0.5)


def _store_source(search_id: str, business_id: str, source_type: str, url: str):
    """Store a lead source URL in the database."""
    if not supabase:
        return
    try:
        domain = _extract_domain(url)
        supabase.table("lead_sources").insert({
            "search_id": search_id,
            "business_id": business_id,
            "source_type": source_type,
            "url": url,
            "domain": domain,
        }).execute()
    except Exception as e:
        print(f"[Worker] Error storing source: {e}")


def _store_contact(
    search_id: str,
    business_id: str,
    contact_type: str,
    raw_value: str,
    normalized_value: str,
    is_valid: bool,
    confidence: float,
    source_url: str,
):
    """Store a lead contact in the database. ON CONFLICT DO NOTHING for idempotency."""
    if not supabase:
        return
    try:
        supabase.table("lead_contacts").upsert(
            {
                "search_id": search_id,
                "business_id": business_id,
                "contact_type": contact_type,
                "raw_value": raw_value,
                "normalized_value": normalized_value,
                "is_valid": is_valid,
                "confidence": confidence,
                "source_url": source_url,
            },
            on_conflict="business_id,contact_type,normalized_value",
            ignore_duplicates=True,
        ).execute()
    except Exception as e:
        print(f"[Worker] Error storing contact: {e}")


def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or ""
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.lower()
    except Exception:
        return ""


async def send_callback(
    job_id: int,
    search_id: str,
    status: str,
    processed: int,
    total: int,
    error: Optional[str] = None,
):
    """Notify the Next.js app that enrichment is complete."""
    payload = {
        "job_id": job_id,
        "search_id": search_id,
        "status": status,
        "processed": processed,
        "total": total,
    }
    if error:
        payload["error"] = error[:500]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                CALLBACK_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {PY_WORKER_SECRET}",
                    "Content-Type": "application/json",
                },
            )
            if response.status_code != 200:
                print(f"[Worker] Callback failed with status {response.status_code}: {response.text}")
            else:
                print(f"[Worker] Callback sent successfully for job {job_id}")
    except Exception as e:
        print(f"[Worker] Error sending callback: {e}")
