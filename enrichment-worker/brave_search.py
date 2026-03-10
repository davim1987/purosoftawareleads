import os
import httpx
from urllib.parse import urlparse
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
BRAVE_COUNTRY = os.getenv("BRAVE_COUNTRY", "AR")
BRAVE_SEARCH_LANG = os.getenv("BRAVE_SEARCH_LANG", "es")
BRAVE_UI_LANG = os.getenv("BRAVE_UI_LANG", "es-AR")
BRAVE_COUNT_DEFAULT = int(os.getenv("BRAVE_COUNT", "10"))
BRAVE_TIMEOUT_SECONDS = float(os.getenv("BRAVE_TIMEOUT_SECONDS", "15"))

# Domains to skip as "business website" (directories, review sites, maps)
SKIP_DOMAINS = {
    "yelp.com", "tripadvisor.com", "tripadvisor.com.ar",
    "google.com", "google.com.ar", "maps.google.com",
    "paginasamarillas.com.ar", "paginasamarillas.com",
    "yellowpages.com", "wikipedia.org", "youtube.com",
    "guiaoleo.com.ar", "restorando.com.ar",
}

SOCIAL_DOMAINS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "linkedin.com": "linkedin",
    "twitter.com": "twitter",
    "x.com": "twitter",
}


def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or ""
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.lower()
    except Exception:
        return ""


def _clean_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def _clamp_count(value: int) -> int:
    return max(1, min(20, value))


def _build_query(
    name: str,
    locality: str,
    provincia: Optional[str] = None,
    rubro: Optional[str] = None,
) -> str:
    parts = [
        _clean_text(name),
        _clean_text(locality),
        _clean_text(provincia),
        _clean_text(rubro),
    ]
    return " ".join([p for p in parts if p]).strip()


def _dedupe_urls(urls: List[str]) -> List[str]:
    seen = set()
    unique = []
    for url in urls:
        domain = _extract_domain(url)
        key = domain or url
        if key in seen:
            continue
        seen.add(key)
        unique.append(url)
    return unique


async def _request_brave(
    client: httpx.AsyncClient, query: str, params: Dict[str, Any], attempt: int
):
    print(f"[BraveSearch] Attempt {attempt} url={BRAVE_SEARCH_URL} params={params}")
    response = await client.get(
        BRAVE_SEARCH_URL,
        params=params,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": BRAVE_API_KEY,
        },
    )
    if response.status_code in (401, 403):
        print(
            f"[BraveSearch] Auth error status={response.status_code} body={response.text[:300]}"
        )
        response.raise_for_status()
    if response.status_code == 422:
        print(
            f"[BraveSearch] Validation error 422 for query='{query}' body={response.text[:400]}"
        )
    response.raise_for_status()
    return response.json()


async def search_business(
    name: str,
    locality: str,
    provincia: Optional[str] = None,
    rubro: Optional[str] = None,
    existing_website: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search Brave for a business by name + locality.
    Returns: {
        website: str | None,
        social_urls: [{ type: str, url: str }],
        all_urls: [str]
    }
    """
    query = _build_query(name, locality, provincia, rubro)
    if not query:
        print("[BraveSearch] Empty query, skipping request")
        return {"website": None, "social_urls": [], "all_urls": []}
    if not BRAVE_API_KEY:
        print("[BraveSearch] Missing BRAVE_API_KEY in environment")
        return {"website": None, "social_urls": [], "all_urls": []}

    count = _clamp_count(BRAVE_COUNT_DEFAULT)

    # Strategy: try strict locale params first, then progressively simplify on 422.
    attempts = [
        {
            "q": query,
            "count": count,
            "country": BRAVE_COUNTRY,
            "search_lang": BRAVE_SEARCH_LANG,
            "ui_lang": BRAVE_UI_LANG,
        },
        {
            "q": query,
            "count": count,
            "country": BRAVE_COUNTRY,
        },
        {
            "q": query,
            "count": count,
        },
    ]

    try:
        async with httpx.AsyncClient(timeout=BRAVE_TIMEOUT_SECONDS) as client:
            data = None
            for idx, params in enumerate(attempts, start=1):
                try:
                    data = await _request_brave(client, query, params, idx)
                    break
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 422 and idx < len(attempts):
                        continue
                    raise
            if data is None:
                return {"website": None, "social_urls": [], "all_urls": []}
    except httpx.TimeoutException as e:
        print(f"[BraveSearch] Timeout query='{query}': {type(e).__name__}: {e}")
        return {"website": None, "social_urls": [], "all_urls": []}
    except httpx.HTTPError as e:
        status = getattr(e.response, "status_code", "n/a") if hasattr(e, "response") else "n/a"
        body = getattr(e.response, "text", "")[:400] if hasattr(e, "response") else ""
        print(
            f"[BraveSearch] HTTP error query='{query}' status={status} "
            f"type={type(e).__name__} body={body}"
        )
        return {"website": None, "social_urls": [], "all_urls": []}
    except Exception as e:
        print(f"[BraveSearch] Error searching query='{query}': {type(e).__name__}: {e}")
        return {"website": None, "social_urls": [], "all_urls": []}

    results = data.get("web", {}).get("results", [])

    website = None
    social_urls = []
    all_urls = []

    for result in results:
        url = result.get("url", "")
        if not url:
            continue

        all_urls.append(url)
        domain = _extract_domain(url)

        # Check if it's a social media profile
        for social_domain, social_type in SOCIAL_DOMAINS.items():
            if social_domain in domain:
                social_urls.append({"type": social_type, "url": url})
                break
        else:
            # Not social media — could be the business website
            if not website and domain not in SKIP_DOMAINS:
                website = url

    all_urls = _dedupe_urls(all_urls)

    if existing_website and website:
        existing_domain = _extract_domain(existing_website)
        brave_domain = _extract_domain(website)
        if existing_domain and brave_domain and existing_domain == brave_domain:
            print(f"[BraveSearch] Existing website domain matches Brave domain: {brave_domain}")

    return {
        "website": website,
        "social_urls": social_urls,
        "all_urls": all_urls,
    }
