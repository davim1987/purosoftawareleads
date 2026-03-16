import re
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

# Patterns for contact extraction
EMAIL_REGEX = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)

# Argentine phone patterns (landline and mobile)
PHONE_REGEX_AR = re.compile(
    r"(?:\+?54\s?9?\s?)?(?:\(?\d{2,4}\)?\s?[\-.]?\s?)?\d{4}\s?[\-.]?\s?\d{4}"
)

# WhatsApp link patterns
WHATSAPP_LINK_REGEX = re.compile(
    r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=)\+?(\d{10,15})"
)

# Common junk emails to filter
JUNK_EMAIL_DOMAINS = {
    "example.com", "sentry.io", "wixpress.com", "w3.org",
    "schema.org", "googleapis.com", "googletagmanager.com",
    "gravatar.com", "wordpress.org", "jquery.com",
}

# Sub-page paths to try for contact info
CONTACT_PATHS = [
    "/contacto", "/contact", "/contactanos", "/contactenos",
    "/about", "/sobre-nosotros", "/quienes-somos",
    "/nosotros", "/empresa",
]

USER_AGENT = "PurosoftwareBot/1.0 (+https://purosoftware.com)"


def _is_junk_email(email: str) -> bool:
    domain = email.split("@")[-1].lower()
    return domain in JUNK_EMAIL_DOMAINS


def _extract_from_html(html: str) -> dict:
    """Extract contacts from a single HTML page."""
    result = {"emails": set(), "phones": set(), "whatsapps": set()}

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    text = soup.get_text(separator=" ")

    # Extract emails from page text
    for e in EMAIL_REGEX.findall(text):
        if not _is_junk_email(e):
            result["emails"].add(e)
    # Also check mailto: links
    for a_tag in soup.find_all("a", href=re.compile(r"^mailto:", re.I)):
        href = a_tag["href"].replace("mailto:", "").split("?")[0].strip()
        if "@" in href and not _is_junk_email(href):
            result["emails"].add(href)

    # Extract phones from tel: links (most reliable)
    for a_tag in soup.find_all("a", href=re.compile(r"^tel:", re.I)):
        phone = a_tag["href"].replace("tel:", "").strip()
        phone = re.sub(r"[^\d+]", "", phone)
        if phone and len(phone) >= 8:
            result["phones"].add(phone)

    # Extract phones from text (less reliable)
    for p in PHONE_REGEX_AR.findall(text):
        clean = re.sub(r"[^\d+]", "", p)
        if len(clean) >= 8:
            result["phones"].add(clean)

    # Extract WhatsApp numbers from links
    for a_tag in soup.find_all("a", href=True):
        wa_match = WHATSAPP_LINK_REGEX.search(a_tag["href"])
        if wa_match:
            result["whatsapps"].add(wa_match.group(1))
    # Also search raw HTML for wa.me links
    for wa_match in WHATSAPP_LINK_REGEX.finditer(html):
        result["whatsapps"].add(wa_match.group(1))

    # Discover contact-related links on this page
    contact_links = set()
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"].lower()
        link_text = (a_tag.get_text() or "").lower().strip()
        if any(kw in href or kw in link_text for kw in ["contact", "contacto", "contactanos", "contactenos"]):
            contact_links.add(a_tag["href"])

    return {
        "emails": result["emails"],
        "phones": result["phones"],
        "whatsapps": result["whatsapps"],
        "contact_links": contact_links,
    }


async def scrape_url(url: str) -> dict:
    """
    Scrape a URL and its contact sub-pages for contact information.
    Returns: { emails: [str], phones: [str], whatsapps: [str] }
    """
    all_emails = set()
    all_phones = set()
    all_whatsapps = set()
    scraped_urls = set()

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=15.0,
            verify=True,
        ) as client:
            # 1. Scrape the main page
            main_html = await _fetch_page(client, url)
            scraped_urls.add(url)

            if main_html:
                extracted = _extract_from_html(main_html)
                all_emails.update(extracted["emails"])
                all_phones.update(extracted["phones"])
                all_whatsapps.update(extracted["whatsapps"])

                # 2. Try known contact sub-pages
                base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
                sub_urls = set()

                # Add discovered contact links from the main page
                for link in extracted.get("contact_links", set()):
                    full = urljoin(url, link)
                    if urlparse(full).netloc == urlparse(url).netloc:
                        sub_urls.add(full)

                # Add common contact paths
                for path in CONTACT_PATHS:
                    sub_urls.add(f"{base_url}{path}")

                # Scrape up to 3 sub-pages (avoid over-crawling)
                sub_count = 0
                for sub_url in sub_urls:
                    if sub_count >= 3:
                        break
                    if sub_url in scraped_urls:
                        continue
                    scraped_urls.add(sub_url)

                    sub_html = await _fetch_page(client, sub_url)
                    if sub_html:
                        sub_extracted = _extract_from_html(sub_html)
                        all_emails.update(sub_extracted["emails"])
                        all_phones.update(sub_extracted["phones"])
                        all_whatsapps.update(sub_extracted["whatsapps"])
                        sub_count += 1

    except Exception as e:
        print(f"[Scraper] Error scraping {url}: {e}")

    return {
        "emails": list(all_emails)[:5],
        "phones": list(all_phones)[:5],
        "whatsapps": list(all_whatsapps)[:3],
    }


async def _fetch_page(client: httpx.AsyncClient, url: str) -> str | None:
    """Fetch a single page, return HTML or None on error."""
    try:
        response = await client.get(
            url,
            headers={"User-Agent": USER_AGENT},
        )
        if response.status_code != 200:
            return None
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            return None
        return response.text
    except Exception:
        return None
