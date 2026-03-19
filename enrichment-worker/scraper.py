import re
import json
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

# WhatsApp link patterns (wa.me, api.whatsapp, whatsapp://, web.whatsapp)
WHATSAPP_LINK_REGEX = re.compile(
    r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp://send\?phone=|web\.whatsapp\.com/send\?phone=)\+?(\d{10,15})"
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


JUNK_EMAIL_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".css", ".js"}

# Placeholder/example emails that are not real contacts
JUNK_EMAIL_PREFIXES = {"ejemplo", "example", "test", "demo", "info@example", "user", "tu-email", "tuemail", "nombre"}


def _is_junk_email(email: str) -> bool:
    email_lower = email.lower()
    domain = email_lower.split("@")[-1]
    prefix = email_lower.split("@")[0]
    if domain in JUNK_EMAIL_DOMAINS:
        return True
    if prefix in JUNK_EMAIL_PREFIXES:
        return True
    # Filter out image/asset filenames that look like emails (e.g. logo@2x.png)
    if any(email.lower().endswith(ext) for ext in JUNK_EMAIL_EXTENSIONS):
        return True
    return False


def _decode_cf_email(encoded: str) -> str:
    """Decode Cloudflare's email obfuscation (XOR cipher)."""
    try:
        r = int(encoded[:2], 16)
        return "".join(
            chr(int(encoded[i : i + 2], 16) ^ r)
            for i in range(2, len(encoded), 2)
        )
    except Exception:
        return ""


SOCIAL_LINK_DOMAINS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "linkedin.com": "linkedin",
    "youtube.com": "other",
    "tiktok.com": "other",
}


def _extract_structured_data(soup: BeautifulSoup, html: str, result: dict):
    """Extract contact data from structured sources: JSON-LD, meta tags, data-* attrs, noscript, script configs."""

    # 1. JSON-LD / Schema.org (most reliable structured data)
    for script_tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script_tag.string or "")
            # Handle both single objects and arrays
            items = data if isinstance(data, list) else [data]
            for item in items:
                _extract_from_jsonld(item, result)
        except (json.JSONDecodeError, TypeError):
            pass

    # 2. Meta tags (OG, Twitter, generic)
    meta_phone_props = ["og:phone_number", "phone", "telephone", "tel"]
    meta_email_props = ["og:email", "email", "contact:email"]
    for meta in soup.find_all("meta"):
        prop = (meta.get("property") or meta.get("name") or "").lower()
        content = (meta.get("content") or "").strip()
        if not content:
            continue
        if prop in meta_phone_props:
            clean = re.sub(r"[^\d+]", "", content)
            if 8 <= len(clean) <= 15:
                result["phones"].add(clean)
        elif prop in meta_email_props:
            if "@" in content and not _is_junk_email(content):
                result["emails"].add(content)
        elif prop == "description":
            # Extract phones/emails from meta description
            for e in EMAIL_REGEX.findall(content):
                if not _is_junk_email(e):
                    result["emails"].add(e)

    # 3. data-* attributes (data-phone, data-whatsapp, data-email, etc.)
    data_phone_attrs = ["data-phone", "data-telephone", "data-tel", "data-celular", "data-mobile"]
    data_wa_attrs = ["data-whatsapp", "data-wa", "data-wanumber", "data-wa-number"]
    data_email_attrs = ["data-email", "data-mail", "data-correo"]
    for el in soup.find_all(True):
        for attr in data_phone_attrs:
            val = el.get(attr)
            if val:
                clean = re.sub(r"[^\d+]", "", str(val))
                if 8 <= len(clean) <= 15:
                    result["phones"].add(clean)
        for attr in data_wa_attrs:
            val = el.get(attr)
            if val:
                clean = re.sub(r"[^\d+]", "", str(val))
                if 8 <= len(clean) <= 15:
                    result["whatsapps"].add(clean)
        for attr in data_email_attrs:
            val = el.get(attr)
            if val and "@" in str(val) and not _is_junk_email(str(val)):
                result["emails"].add(str(val).strip())

    # 4. Inline <script> widget configs (JoinChat, Elfsight, WP plugins)
    widget_phone_regex = re.compile(
        r'["\'](?:phone|telephone|whatsapp|wa_number|whatsapp_number|celular|mobile|numero)["\']'
        r'\s*[:=]\s*["\'](\+?[\d\s\-().]{8,20})["\']',
        re.IGNORECASE,
    )
    widget_email_regex = re.compile(
        r'["\'](?:email|correo|contact_email|mail)["\']'
        r'\s*[:=]\s*["\']([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})["\']',
        re.IGNORECASE,
    )
    for script_tag in soup.find_all("script"):
        script_text = script_tag.string or ""
        if not script_text.strip():
            continue
        for m in widget_phone_regex.finditer(script_text):
            clean = re.sub(r"[^\d+]", "", m.group(1))
            if 8 <= len(clean) <= 15:
                result["whatsapps"].add(clean)
        for m in widget_email_regex.finditer(script_text):
            email = m.group(1)
            if not _is_junk_email(email):
                result["emails"].add(email)

    # 5. <noscript> fallback content
    for noscript in soup.find_all("noscript"):
        ns_text = noscript.get_text(separator=" ")
        for e in EMAIL_REGEX.findall(ns_text):
            if not _is_junk_email(e):
                result["emails"].add(e)
        for p in PHONE_REGEX_AR.findall(ns_text):
            clean = re.sub(r"[^\d+]", "", p)
            if 8 <= len(clean) <= 15:
                result["phones"].add(clean)


def _extract_from_jsonld(item: dict, result: dict):
    """Recursively extract contact data from a JSON-LD object."""
    if not isinstance(item, dict):
        return

    # Phone
    for key in ("telephone", "phone", "contactPoint"):
        val = item.get(key)
        if isinstance(val, str):
            clean = re.sub(r"[^\d+]", "", val)
            if 8 <= len(clean) <= 15:
                result["phones"].add(clean)
        elif isinstance(val, dict):
            _extract_from_jsonld(val, result)
        elif isinstance(val, list):
            for v in val:
                if isinstance(v, str):
                    clean = re.sub(r"[^\d+]", "", v)
                    if 8 <= len(clean) <= 15:
                        result["phones"].add(clean)
                elif isinstance(v, dict):
                    _extract_from_jsonld(v, result)

    # Email
    for key in ("email",):
        val = item.get(key)
        if isinstance(val, str) and "@" in val and not _is_junk_email(val):
            result["emails"].add(val.strip())

    # Social / URL
    for key in ("url", "sameAs"):
        val = item.get(key)
        urls = val if isinstance(val, list) else ([val] if isinstance(val, str) else [])
        for u in urls:
            if not isinstance(u, str):
                continue
            u_lower = u.lower()
            if "instagram.com" in u_lower or "facebook.com" in u_lower:
                for social_domain, social_type in SOCIAL_LINK_DOMAINS.items():
                    if social_domain in u_lower:
                        result["social"].append({"type": social_type, "url": u})
                        break


def _extract_from_html(html: str) -> dict:
    """Extract contacts and social media links from a single HTML page."""
    result = {"emails": set(), "phones": set(), "whatsapps": set(), "social": []}

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

    # Decode Cloudflare-protected emails (data-cfemail XOR cipher)
    for cf_tag in soup.find_all(attrs={"data-cfemail": True}):
        decoded = _decode_cf_email(cf_tag["data-cfemail"])
        if "@" in decoded and not _is_junk_email(decoded):
            result["emails"].add(decoded)

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

    # Extract WhatsApp from JS widgets (JoinChat, Elfsight, etc.)
    # Matches patterns like "telephone":"5492235552612" or 'phone':'5491112345678'
    for js_wa in re.finditer(r'["\'](?:telephone|phone|whatsapp)["\']:\s*["\'](\+?\d{10,15})["\']', html):
        result["whatsapps"].add(js_wa.group(1))

    # Detect WhatsApp numbers near WhatsApp keywords/icons in text
    # Handles cases like "WhatsApp: 11 7620 2945" or "📱 11 7620-2945"
    wa_text_regex = re.compile(
        r'(?:whatsapp|wapp|wa\b)\s*[:\-]?\s*(\+?[\d\s\-().]{8,20})',
        re.IGNORECASE,
    )
    for wa_text in wa_text_regex.finditer(text):
        clean = re.sub(r"[^\d+]", "", wa_text.group(1))
        if 8 <= len(clean) <= 15:
            result["whatsapps"].add(clean)
    # Also check raw HTML for whatsapp keyword + number patterns
    for wa_html in wa_text_regex.finditer(html):
        clean = re.sub(r"[^\d+]", "", wa_html.group(1))
        if 8 <= len(clean) <= 15:
            result["whatsapps"].add(clean)

    # Detect WhatsApp numbers next to WhatsApp icons (class="whatsapp" or similar)
    # Many sites use <i class="icon-whatsapp"></i> <span>11 7620 2945</span>
    for el in soup.find_all(class_=re.compile(r'whatsapp|wa-icon|fa-whatsapp|icon-whatsapp', re.I)):
        # Check siblings and parent for phone numbers
        parent = el.parent
        if parent:
            parent_text = parent.get_text(separator=" ")
            for p in PHONE_REGEX_AR.findall(parent_text):
                clean = re.sub(r"[^\d+]", "", p)
                if 8 <= len(clean) <= 15:
                    result["whatsapps"].add(clean)

    # Search raw HTML for emails in JS templates, inline data, or SPAs
    for e in EMAIL_REGEX.findall(html):
        if not _is_junk_email(e):
            result["emails"].add(e)

    # Search raw HTML for phones - only trust numbers near phone-related keywords
    # to avoid false positives from CSS values, timestamps, IDs, etc.
    phone_context_regex = re.compile(
        r'(?:tel[eéf]fono|phone|celular|móvil|movil|whatsapp|llamar|tel:|"tel")\s*[:=]?\s*["\']?\s*(\+?[\d\s\-().]{8,20})',
        re.IGNORECASE,
    )
    for m in phone_context_regex.finditer(html):
        clean = re.sub(r"[^\d+]", "", m.group(1))
        if 8 <= len(clean) <= 15:
            result["phones"].add(clean)

    # Extract social media links (Instagram, Facebook, LinkedIn)
    seen_social_domains = set()
    for a_tag in soup.find_all("a", href=True):
        href = str(a_tag["href"]).strip()
        href_lower = href.lower()
        for social_domain, social_type in SOCIAL_LINK_DOMAINS.items():
            if social_domain in href_lower and social_domain not in seen_social_domains:
                # Skip share/sharer/intent links (these are share buttons, not profile links)
                if "/sharer" in href_lower or "/share" in href_lower or "intent" in href_lower:
                    continue
                seen_social_domains.add(social_domain)
                result["social"].append({"type": social_type, "url": href})
                break

    # Extract from structured sources (JSON-LD, meta tags, data-* attrs, script configs, noscript)
    _extract_structured_data(soup, html, result)

    # Discover contact-related links on this page
    contact_links = set()
    for a_tag in soup.find_all("a", href=True):
        href = str(a_tag["href"]).lower()
        link_text = (a_tag.get_text() or "").lower().strip()
        if any(kw in href or kw in link_text for kw in ["contact", "contacto", "contactanos", "contactenos"]):
            contact_links.add(str(a_tag["href"]))

    return {
        "emails": result["emails"],
        "phones": result["phones"],
        "whatsapps": result["whatsapps"],
        "social": result["social"],
        "contact_links": contact_links,
    }


async def scrape_url(url: str) -> dict:
    """
    Scrape a URL and its contact sub-pages for contact information.
    Returns: { emails: [str], phones: [str], whatsapps: [str], social: [{ type, url }] }
    """
    all_emails = set()
    all_phones = set()
    all_whatsapps = set()
    all_social: list[dict] = []
    seen_social_types = set()
    scraped_urls = set()

    def _merge_social(social_list: list[dict]):
        for s in social_list:
            if s["type"] not in seen_social_types:
                seen_social_types.add(s["type"])
                all_social.append(s)

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
                _merge_social(extracted.get("social", []))

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
                        _merge_social(sub_extracted.get("social", []))
                        sub_count += 1

    except Exception as e:
        print(f"[Scraper] Error scraping {url}: {e}")

    return {
        "emails": list(all_emails)[:5],
        "phones": list(all_phones)[:5],
        "whatsapps": list(all_whatsapps)[:3],
        "social": all_social,
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
