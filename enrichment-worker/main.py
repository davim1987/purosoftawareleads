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

# Scraping limits (configurable via env)
MAX_URLS_PER_BUSINESS = int(os.getenv("MAX_URLS_PER_BUSINESS", "5"))
MAX_SCRAPE_RETRIES = int(os.getenv("MAX_SCRAPE_RETRIES", "1"))
SCRAPE_RETRY_DELAY = float(os.getenv("SCRAPE_RETRY_DELAY", "2.0"))

# --- Startup diagnostics ---
print("=" * 60)
print("[Worker] STARTUP DIAGNOSTICS")
print(f"[Worker] SUPABASE_URL = {'SET (' + SUPABASE_URL[:30] + '...)' if SUPABASE_URL else 'EMPTY/MISSING'}")
print(f"[Worker] SUPABASE_SERVICE_ROLE_KEY = {'SET (' + SUPABASE_KEY[:20] + '...)' if SUPABASE_KEY else 'EMPTY/MISSING'}")
print(f"[Worker] PY_WORKER_SECRET = {'SET' if PY_WORKER_SECRET else 'EMPTY/MISSING'}")
print(f"[Worker] CALLBACK_URL = {CALLBACK_URL}")
print(f"[Worker] BRAVE_API_KEY = {'SET' if os.getenv('BRAVE_API_KEY') else 'EMPTY/MISSING'}")
print(f"[Worker] MAX_URLS_PER_BUSINESS = {MAX_URLS_PER_BUSINESS}")
print(f"[Worker] MAX_SCRAPE_RETRIES = {MAX_SCRAPE_RETRIES}")
print("=" * 60)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

if supabase:
    print("[Worker] Supabase client created successfully")
else:
    print("[Worker] Supabase client NOT created - SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is empty")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# --- Models ---

class Business(BaseModel):
    id: str
    name: str
    locality: str
    provincia: Optional[str] = None
    rubro: Optional[str] = None
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
    return {
        "status": "ok",
        "supabase_configured": supabase is not None,
        "supabase_url_set": bool(SUPABASE_URL),
        "supabase_key_set": bool(SUPABASE_KEY),
        "worker_secret_set": bool(PY_WORKER_SECRET),
        "brave_key_set": bool(os.getenv("BRAVE_API_KEY")),
        "callback_url": CALLBACK_URL,
        "max_urls_per_business": MAX_URLS_PER_BUSINESS,
        "max_scrape_retries": MAX_SCRAPE_RETRIES,
    }


class TestScrapeRequest(BaseModel):
    url: str


@app.post("/test-scrape")
async def test_scrape(request: TestScrapeRequest, authorization: str = Header(...)):
    """Test endpoint: scrape a URL and return all extracted data (no DB writes)."""
    verify_auth(authorization)
    try:
        contacts = await scrape_url(request.url)
        # Also normalize the phones/whatsapps to show final format
        normalized_phones = []
        for p in contacts.get("phones", []):
            norm, valid = normalize_phone(p)
            normalized_phones.append({"raw": p, "normalized": norm, "valid": valid})
        normalized_whatsapps = []
        for w in contacts.get("whatsapps", []):
            norm, valid = normalize_whatsapp(w)
            normalized_whatsapps.append({"raw": w, "normalized": norm, "valid": valid})
        normalized_emails = []
        for e in contacts.get("emails", []):
            norm, valid = normalize_email(e)
            normalized_emails.append({"raw": e, "normalized": norm, "valid": valid})
        return {
            "url": request.url,
            "raw": {
                "emails": list(contacts.get("emails", [])),
                "phones": list(contacts.get("phones", [])),
                "whatsapps": list(contacts.get("whatsapps", [])),
                "social": contacts.get("social", []),
            },
            "normalized": {
                "emails": normalized_emails,
                "phones": normalized_phones,
                "whatsapps": normalized_whatsapps,
            },
            "llm_action_proof": contacts.get("llm_raw_extraction", {})
        }
    except Exception as e:
        return {"error": str(e), "url": request.url}


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
    """Main enrichment loop with parallel processing (Semaphore)."""
    job_id = request.job_id
    search_id = request.search_id
    total = len(request.businesses)
    processed = 0

    # Use a semaphore to limit concurrency (e.g., 5 businesses at a time)
    semaphore = asyncio.Semaphore(5)

    print(f"[Worker] Starting enrichment job {job_id} for search {search_id} ({total} businesses) [PARALLEL MODE]")

    async def enriched_wrapped(business: Business):
        nonlocal processed
        async with semaphore:
            try:
                if supabase:
                    try:
                        supabase.table("enrichment_jobs").update({
                            "current_business_name": business.name,
                        }).eq("id", job_id).execute()
                    except Exception as db_err:
                        print(f"[Worker] DB Current Business Error: {db_err}")

                await enrich_single_business(search_id, business)
            except Exception as e:
                print(f"[Worker] Error enriching business '{business.name}': {e}")
                traceback.print_exc()
            finally:
                processed += 1
                if supabase:
                    try:
                        supabase.table("enrichment_jobs").update({
                            "processed_businesses": processed,
                            "current_business_name": None if processed >= total else business.name,
                        }).eq("id", job_id).execute()
                    except Exception as db_err:
                        print(f"[Worker] DB Progress Error: {db_err}")

    try:
        # Run businesses concurrently
        tasks = [enriched_wrapped(b) for b in request.businesses]
        await asyncio.gather(*tasks)

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


def _prioritize_urls(urls: list[str], existing_website: Optional[str] = None) -> list[str]:
    """
    Prioritize URLs for scraping. Order:
    1. Business's own website (from Google Maps)
    2. URLs with contact-related keywords in path
    3. Other URLs
    """
    contact_keywords = {"contact", "contacto", "about", "nosotros", "empresa", "info"}
    priority_high = []
    priority_medium = []
    priority_low = []

    for url in urls:
        path = urlparse(url).path.lower()
        if existing_website and _extract_domain(url) == _extract_domain(existing_website):
            priority_high.append(url)
        elif any(kw in path for kw in contact_keywords):
            priority_medium.append(url)
        else:
            priority_low.append(url)

    return priority_high + priority_medium + priority_low


async def _scrape_with_retry(url: str) -> Optional[dict]:
    """Scrape a URL with retry logic on failure."""
    for attempt in range(1 + MAX_SCRAPE_RETRIES):
        try:
            contacts = await scrape_url(url)
            # Check if we got any useful data
            has_data = (
                contacts.get("emails") or
                contacts.get("phones") or
                contacts.get("whatsapps") or
                contacts.get("social")
            )
            if has_data or attempt >= MAX_SCRAPE_RETRIES:
                return contacts
            # No data found, retry might help (transient issue)
            print(f"[Worker] No data from {url}, retrying ({attempt + 1}/{MAX_SCRAPE_RETRIES})...")
            await asyncio.sleep(SCRAPE_RETRY_DELAY)
        except Exception as e:
            if attempt < MAX_SCRAPE_RETRIES:
                print(f"[Worker] Scrape failed for {url} (attempt {attempt + 1}), retrying: {e}")
                await asyncio.sleep(SCRAPE_RETRY_DELAY)
            else:
                print(f"[Worker] Scrape failed for {url} after {attempt + 1} attempts: {e}")
                return None
    return None


async def enrich_single_business(search_id: str, business: Business):
    """Enrich a single business: store existing data, search Brave, scrape URLs, store results."""
    if not supabase:
        print("[Worker] No Supabase client configured, skipping DB operations")
        return

    print(
        f"[Worker] Enriching business='{business.name}' locality='{business.locality}' "
        f"provincia='{business.provincia or ''}' rubro='{business.rubro or ''}'"
    )

    # --- Step 0: Store existing data from Google Maps as high-confidence contacts ---
    if business.existing_phone:
        normalized_phone, is_valid = normalize_phone(business.existing_phone)
        if normalized_phone:
            _store_contact(
                search_id, business.id, "phone",
                business.existing_phone, normalized_phone, is_valid,
                0.95,  # High confidence: from Google Maps
                "google_maps",
            )
            print(f"[Worker] Stored existing phone from Maps: {normalized_phone}")

    if business.existing_email:
        normalized_email, is_valid = normalize_email(business.existing_email)
        if normalized_email:
            _store_contact(
                search_id, business.id, "email",
                business.existing_email, normalized_email, is_valid,
                0.95,  # High confidence: from Google Maps
                "google_maps",
            )
            print(f"[Worker] Stored existing email from Maps: {normalized_email}")

    # --- Step 1: Search Brave for website + social media URLs ---
    brave_results = await search_business(
        business.name,
        business.locality,
        business.provincia,
        business.rubro,
        business.existing_website,
    )
    print(
        f"[Worker] Brave results for business='{business.name}': "
        f"website={'yes' if brave_results['website'] else 'no'}, "
        f"social={len(brave_results['social_urls'])}, all_urls={len(brave_results['all_urls'])}"
    )

    # --- Step 1b: Store contacts extracted from Brave snippets ---
    snippet_contacts = brave_results.get("snippet_contacts", {})
    for raw_email in snippet_contacts.get("emails", []):
        normalized, is_valid = normalize_email(raw_email)
        if normalized:
            _store_contact(
                search_id, business.id, "email",
                raw_email, normalized, is_valid,
                0.6,  # Medium confidence: from search snippet
                "brave_snippet",
            )
            print(f"[Worker] Stored snippet email: {normalized}")

    for raw_phone in snippet_contacts.get("phones", []):
        normalized, is_valid = normalize_phone(raw_phone)
        if normalized:
            _store_contact(
                search_id, business.id, "phone",
                raw_phone, normalized, is_valid,
                0.6,  # Medium confidence: from search snippet
                "brave_snippet",
            )
            print(f"[Worker] Stored snippet phone: {normalized}")

    # --- Step 2: Build URL list for scraping ---
    urls_to_scrape = []
    scraped_domains = set()

    # Always scrape existing website first (from Google Maps - most reliable)
    if business.existing_website:
        urls_to_scrape.append(business.existing_website)
        scraped_domains.add(_extract_domain(business.existing_website))

    # Store website source from Brave and scrape if different domain
    if brave_results["website"]:
        _store_source(search_id, business.id, "website", brave_results["website"])
        brave_domain = _extract_domain(brave_results["website"])
        if brave_domain not in scraped_domains:
            urls_to_scrape.append(brave_results["website"])
            scraped_domains.add(brave_domain)

    # Add extra URLs from Brave that look promising (contact pages, sub-pages of site)
    for extra_url in brave_results.get("all_urls", []):
        extra_domain = _extract_domain(extra_url)
        # Skip social and directory domains
        if any(sd in extra_domain for sd in ("instagram.com", "facebook.com", "linkedin.com", "twitter.com", "x.com")):
            continue
        if extra_domain in scraped_domains:
            # Allow same-domain if the path has contact keywords
            path_lower = urlparse(extra_url).path.lower()
            if any(kw in path_lower for kw in ("contact", "contacto", "about", "nosotros")):
                urls_to_scrape.append(extra_url)
            continue
        if extra_domain not in scraped_domains:
            urls_to_scrape.append(extra_url)
            scraped_domains.add(extra_domain)

    # Store social media sources
    for social in brave_results["social_urls"]:
        _store_source(search_id, business.id, social["type"], social["url"])

    # --- Step 3: Prioritize and scrape URLs ---
    urls_to_scrape = _prioritize_urls(urls_to_scrape, business.existing_website)

    for url in urls_to_scrape[:MAX_URLS_PER_BUSINESS]:
        contacts = await _scrape_with_retry(url)
        if contacts is None:
            continue

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

        # Store social media links found in the page HTML
        for social in contacts.get("social", []):
            _store_source(search_id, business.id, social["type"], social["url"])
            print(f"[Worker] Found {social['type']} from HTML scrape: {social['url']}")

    # Small delay to avoid hammering servers
    await asyncio.sleep(0.5)


def _store_source(search_id: str, business_id: str, source_type: str, url: str):
    """Store a lead source URL and update leads_free_search."""
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

        # Back-fill leads_free_search
        update_data = {}
        if source_type == "website":
            update_data["web"] = url
        elif source_type == "instagram":
            update_data["instagram"] = url
        elif source_type == "facebook":
            update_data["facebook"] = url

        if update_data:
            supabase.table("leads_free_search").update(update_data).eq("id", business_id).execute()

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
    """Store a lead contact and back-fill leads_free_search."""
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
        ).execute()

        # Back-fill leads_free_search table
        if is_valid and confidence >= 0.6:
            update_data = {}
            if contact_type == "email":
                update_data["email"] = normalized_value
            elif contact_type == "whatsapp":
                update_data["whatsapp"] = normalized_value
            elif contact_type == "phone":
                update_data["telefono"] = normalized_value

            if update_data:
                supabase.table("leads_free_search").update(update_data).eq("id", business_id).execute()

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
