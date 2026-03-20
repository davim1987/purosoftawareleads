import re
import os
import json
import asyncio
from urllib.parse import urljoin, urlparse
from typing import Optional
import httpx
from bs4 import BeautifulSoup
from openai import AsyncOpenAI
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

# Expanded sub-page paths to try for contact info
CONTACT_PATHS = [
    "/contacto", "/contact", "/contactanos", "/contactenos",
    "/about", "/sobre-nosotros", "/quienes-somos",
    "/nosotros", "/empresa", "/sucursales", "/locales",
    "/tiendas", "/ubicacion", "/ubicaciones", "/equipo",
    "/staff", "/info", "/informacion",
    "/contacto.html", "/contact.html", "/about-us",
    "/como-llegar", "/donde-estamos", "/encuentranos",
    "/datos-de-contacto", "/telefonos", "/atencion-al-cliente",
]

# Keywords to detect contact-related links on pages
CONTACT_LINK_KEYWORDS = [
    "contact", "contacto", "contactanos", "contactenos",
    "sucursal", "ubicacion", "tienda", "local",
    "donde estamos", "como llegar", "encuentranos",
    "atencion al cliente", "telefonos", "datos de contacto",
    "about", "nosotros", "empresa", "quienes somos",
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
        prop = str(meta.get("property") or meta.get("name") or "").lower()
        content = str(meta.get("content") or "").strip()
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


def _extract_from_headings(soup: BeautifulSoup, result: dict):
    """Extract contacts from title and heading tags (h1-h3) -- many Argentine businesses put phone numbers there."""
    # Check <title>
    title_tag = soup.find("title")
    if title_tag:
        title_text = title_tag.get_text(separator=" ")
        for e in EMAIL_REGEX.findall(title_text):
            if not _is_junk_email(e):
                result["emails"].add(e)
        for p in PHONE_REGEX_AR.findall(title_text):
            clean = re.sub(r"[^\d+]", "", p)
            if 8 <= len(clean) <= 15:
                result["phones"].add(clean)

    # Check h1, h2, h3
    for tag_name in ("h1", "h2", "h3"):
        for heading in soup.find_all(tag_name):
            heading_text = heading.get_text(separator=" ")
            for e in EMAIL_REGEX.findall(heading_text):
                if not _is_junk_email(e):
                    result["emails"].add(e)
            for p in PHONE_REGEX_AR.findall(heading_text):
                clean = re.sub(r"[^\d+]", "", p)
                if 8 <= len(clean) <= 15:
                    result["phones"].add(clean)


def _extract_footer_links(soup: BeautifulSoup, base_url: str) -> set:
    """
    Extract contact-relevant links from the page footer.
    Many sites have contact links only in the footer that aren't caught by keyword matching.
    """
    footer_links = set()
    base_netloc = urlparse(base_url).netloc

    # Find footer elements: <footer>, elements with footer class/id
    footer_elements = []
    footer_tag = soup.find("footer")
    if footer_tag:
        footer_elements.append(footer_tag)
    for el in soup.find_all(True, attrs={"class": re.compile(r"footer", re.I)}):
        footer_elements.append(el)
    for el in soup.find_all(True, attrs={"id": re.compile(r"footer", re.I)}):
        footer_elements.append(el)

    for footer_el in footer_elements:
        for a_tag in footer_el.find_all("a", href=True):
            href = str(a_tag.get("href", ""))
            link_text = (a_tag.get_text() or "").lower().strip()
            full_url = urljoin(base_url, href)

            # Only follow same-domain links
            if urlparse(full_url).netloc != base_netloc:
                continue

            href_lower = href.lower()
            # Check if the link looks like a contact/about page
            if any(kw in href_lower or kw in link_text for kw in CONTACT_LINK_KEYWORDS):
                footer_links.add(full_url)

    return footer_links


def _is_spa(html: str, soup: BeautifulSoup) -> bool:
    """
    Detect if a page is likely a Single Page Application (SPA) that needs
    JavaScript rendering to show its content.
    """
    body = soup.find("body")
    if not body:
        return False

    body_text = body.get_text(separator=" ", strip=True)
    script_tags = soup.find_all("script")

    # Heuristic 1: Very little text content but many script tags
    if len(body_text) < 100 and len(script_tags) > 3:
        return True

    # Heuristic 2: Common SPA root containers with no meaningful content
    spa_roots = body.find_all(True, attrs={"id": re.compile(r"^(root|app|__next|__nuxt)$", re.I)})
    if spa_roots:
        for root in spa_roots:
            root_text = root.get_text(separator=" ", strip=True)
            # If the SPA root has almost no text, it's likely waiting for JS
            if len(root_text) < 50 and len(root.find_all(True)) < 5:
                return True

    # Heuristic 3: Page has "loading" or "noscript" warnings about JS
    noscript_tags = soup.find_all("noscript")
    for ns in noscript_tags:
        ns_text = (ns.get_text() or "").lower()
        if "javascript" in ns_text or "enable" in ns_text or "habilitar" in ns_text:
            return True

    return False


async def _fetch_page_playwright(url: str) -> Optional[str]:
    """
    Fetch a page using Playwright headless Chromium for SPA/JS-rendered content.
    Returns HTML after JavaScript execution, or None on error.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[Scraper] Playwright not installed, skipping SPA rendering")
        return None

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720},
            )
            page = await context.new_page()

            try:
                await page.goto(url, wait_until="networkidle", timeout=20000)
                # Extra wait for lazy-loaded content
                await page.wait_for_timeout(2000)
                html = await page.content()
                return html
            except Exception as e:
                print(f"[Scraper] Playwright page error for {url}: {e}")
                return None
            finally:
                await context.close()
                await browser.close()
    except Exception as e:
        print(f"[Scraper] Playwright browser error: {e}")
        return None


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
        href = str(a_tag["href"]).replace("mailto:", "").split("?")[0].strip()
        if "@" in href and not _is_junk_email(href):
            result["emails"].add(href)

    # Decode Cloudflare-protected emails (data-cfemail XOR cipher)
    for cf_tag in soup.find_all(attrs={"data-cfemail": True}):
        decoded = _decode_cf_email(str(cf_tag["data-cfemail"]))
        if "@" in decoded and not _is_junk_email(decoded):
            result["emails"].add(decoded)

    # Extract phones from tel: links (most reliable)
    for a_tag in soup.find_all("a", href=re.compile(r"^tel:", re.I)):
        phone = str(a_tag["href"]).replace("tel:", "").strip()
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
        href_str = str(a_tag["href"])
        wa_match = WHATSAPP_LINK_REGEX.search(href_str)
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
    # Handles cases like "WhatsApp: 11 7620 2945" or "wapp: 11 7620-2945"
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
        r'(?:tel[eéf]fono|phone|celular|movil|whatsapp|llamar|tel:|"tel")\s*[:=]?\s*["\']?\s*(\+?[\d\s\-().]{8,20})',
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

    # Extract from headings and title (many Argentine businesses put phone in h1/h2)
    _extract_from_headings(soup, result)

    # Discover contact-related links on this page (expanded keyword set)
    contact_links = set()
    for a_tag in soup.find_all("a", href=True):
        href = str(a_tag["href"]).lower()
        link_text = (a_tag.get_text() or "").lower().strip()
        if any(kw in href or kw in link_text for kw in CONTACT_LINK_KEYWORDS):
            contact_links.add(str(a_tag["href"]))

    # Extract footer links (many sites only have contact links in footer)
    # Note: we pass empty base_url here; the caller provides it when needed
    footer_contact_links = set()
    footer_elements = []
    footer_tag = soup.find("footer")
    if footer_tag:
        footer_elements.append(footer_tag)
    for el in soup.find_all(True, attrs={"class": re.compile(r"footer", re.I)}):
        footer_elements.append(el)
    for el in soup.find_all(True, attrs={"id": re.compile(r"footer", re.I)}):
        footer_elements.append(el)
    for footer_el in footer_elements:
        for a_tag in footer_el.find_all("a", href=True):
            href = str(a_tag.get("href", ""))
            link_text = (a_tag.get_text() or "").lower().strip()
            href_lower = href.lower()
            if any(kw in href_lower or kw in link_text for kw in CONTACT_LINK_KEYWORDS):
                footer_contact_links.add(href)

    contact_links.update(footer_contact_links)

    return {
        "emails": result["emails"],
        "phones": result["phones"],
        "whatsapps": result["whatsapps"],
        "social": result["social"],
        "contact_links": contact_links,
        "is_spa": _is_spa(html, soup),
    }


async def _extract_contacts_with_llm(html: str) -> dict:
    """Extrae contactos desde el HTML limpio utilizando Grok-4.1-fast vía OpenRouter."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return {"emails": set(), "phones": set(), "whatsapps": set(), "social": []}
    
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")
        
    # Limpiamos ruido grande
    for element in soup(["script", "style", "noscript", "svg", "path", "img"]):
        element.decompose()
    
    text_content = soup.get_text(separator="\n", strip=True)
    # Acotamos el tamaño del contexto para evitar límite de tokens 
    text_content = text_content[:30000]

    if len(text_content) < 50:
        return {"emails": set(), "phones": set(), "whatsapps": set(), "social": []}

    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key
    )
    
    try:
        response = await client.chat.completions.create(
            model="x-ai/grok-4.1-fast",
            messages=[
                {
                    "role": "system",
                    "content": 'You are a data extraction assistant for Argentine business websites. Extract emails, phone numbers (format as clean E.164 if possible without spaces), and social media profile URLs (only Instagram, Facebook, LinkedIn, TikTok, Twitter). Respond STRICTLY in JSON matching this schema: {"emails": ["example@domain.com"], "phones": ["+5491112345678"], "social_links": ["https://instagram.com/example"]}. If none of a type are found, return an empty array for that key.'
                },
                {"role": "user", "content": f"Extract contacts from this webpage text:\n\n{text_content}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        
        result_json = response.choices[0].message.content
        data = json.loads(result_json)
        
        return {
            "emails": set(data.get("emails", [])),
            "phones": set(data.get("phones", [])),
            "whatsapps": set(), # Tratamos los teléfonos del LLM de forma genérica
            "social": [{"type": "other", "url": u} for u in data.get("social_links", [])]
        }
    except Exception as e:
        print(f"[Scraper] LLM Extraction Error: {e}")
        return {"emails": set(), "phones": set(), "whatsapps": set(), "social": []}


async def scrape_url(url: str, use_playwright_fallback: bool = True) -> dict:
    """
    Scrape a URL and its contact sub-pages for contact information.
    If the main page is detected as a SPA and Playwright is available,
    re-fetches with headless Chromium for JS-rendered content.

    Returns: { emails: [str], phones: [str], whatsapps: [str], social: [{ type, url }] }
    """
    all_emails: set = set()
    all_phones: set = set()
    all_whatsapps: set = set()
    all_social: list[dict] = []
    seen_social_types: set = set()
    scraped_urls: set = set()

    def _merge_social(social_list: list[dict]):
        for s in social_list:
            if s["type"] not in seen_social_types:
                seen_social_types.add(s["type"])
                all_social.append(s)

    def _merge_extracted(extracted: dict):
        all_emails.update(extracted["emails"])
        all_phones.update(extracted["phones"])
        all_whatsapps.update(extracted["whatsapps"])
        _merge_social(extracted.get("social", []))

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

                # If detected as SPA and Playwright is available, re-fetch with JS rendering
                if extracted.get("is_spa") and use_playwright_fallback:
                    print(f"[Scraper] SPA detected for {url}, trying Playwright...")
                    pw_html = await _fetch_page_playwright(url)
                    if pw_html and len(pw_html) > len(main_html):
                        # Re-extract from the JS-rendered version
                        extracted = _extract_from_html(pw_html)
                        main_html = pw_html
                        print(f"[Scraper] Playwright rendered {url} successfully ({len(pw_html)} chars)")

                _merge_extracted(extracted)

                # --- LLM EXTRACTION ENHANCEMENT ---
                # Corremos la extracción paralela usando el HTML más completo que hayamos conseguido
                print(f"[Scraper] LLM Extraction Started for {url}...", flush=True)
                llm_out = await _extract_contacts_with_llm(main_html)
                print(f"[Scraper] LLM Extraction Finished for {url}. Found: {len(llm_out['emails'])} emails, {len(llm_out['phones'])} phones.", flush=True)
                
                _merge_extracted(llm_out)
                
                # Guardamos lo que sacó el LLM para mostrarlo en el JSON final
                llm_metrics = {
                    "emails": list(llm_out["emails"]),
                    "phones": list(llm_out["phones"])
                }
                # ----------------------------------

                # 2. Collect sub-page URLs from multiple sources
                base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
                base_netloc = urlparse(url).netloc
                sub_urls = set()

                # Source A: Contact links discovered in the main page (including footer)
                for link in extracted.get("contact_links", set()):
                    full = urljoin(url, link)
                    if urlparse(full).netloc == base_netloc:
                        sub_urls.add(full)

                # Source B: Footer-specific links
                footer_links = _extract_footer_links(
                    BeautifulSoup(main_html, "lxml") if main_html else BeautifulSoup("", "html.parser"),
                    url
                )
                sub_urls.update(footer_links)

                # Source C: Common contact paths (static list)
                for path in CONTACT_PATHS:
                    sub_urls.add(f"{base_url}{path}")

                # Remove the main URL from sub-pages
                sub_urls.discard(url)

                # 3. Scrape up to 8 sub-pages
                sub_count = 0
                for sub_url in sub_urls:
                    if sub_count >= 8:
                        break
                    if sub_url in scraped_urls:
                        continue
                    scraped_urls.add(sub_url)

                    sub_html = await _fetch_page(client, sub_url)
                    if sub_html:
                        sub_extracted = _extract_from_html(sub_html)
                        _merge_extracted(sub_extracted)
                        sub_count += 1

    except Exception as e:
        print(f"[Scraper] Error scraping {url}: {e}")

    return {
        "emails": list(all_emails)[:5],
        "phones": list(all_phones)[:5],
        "whatsapps": list(all_whatsapps)[:3],
        "social": all_social,
        "llm_raw_extraction": locals().get("llm_metrics", {"emails": [], "phones": []})
    }


async def _fetch_page(client: httpx.AsyncClient, url: str) -> Optional[str]:
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
