import os
import httpx
from urllib.parse import urlparse

BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

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


async def search_business(name: str, locality: str) -> dict:
    """
    Search Brave for a business by name + locality.
    Returns: {
        website: str | None,
        social_urls: [{ type: str, url: str }],
        all_urls: [str]
    }
    """
    query = f"{name} {locality}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                BRAVE_SEARCH_URL,
                params={"q": query, "count": 10, "country": "AR", "search_lang": "es"},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": BRAVE_API_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[BraveSearch] Error searching '{query}': {e}")
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

    return {
        "website": website,
        "social_urls": social_urls,
        "all_urls": all_urls,
    }
