import re
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
}

USER_AGENT = "PurosoftwareBot/1.0 (+https://purosoftware.com)"


def _is_junk_email(email: str) -> bool:
    domain = email.split("@")[-1].lower()
    return domain in JUNK_EMAIL_DOMAINS


async def scrape_url(url: str) -> dict:
    """
    Scrape a URL for contact information.
    Returns: { emails: [str], phones: [str], whatsapps: [str] }
    """
    result = {"emails": [], "phones": [], "whatsapps": []}

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=15.0,
            verify=True,
        ) as client:
            response = await client.get(
                url,
                headers={"User-Agent": USER_AGENT},
            )
            if response.status_code != 200:
                return result

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                return result

            html = response.text

    except Exception as e:
        print(f"[Scraper] Error fetching {url}: {e}")
        return result

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    text = soup.get_text(separator=" ")

    # Extract emails from page text
    raw_emails = set(EMAIL_REGEX.findall(text))
    # Also check mailto: links
    for a_tag in soup.find_all("a", href=re.compile(r"^mailto:", re.I)):
        href = a_tag["href"].replace("mailto:", "").split("?")[0].strip()
        if "@" in href:
            raw_emails.add(href)

    result["emails"] = [e for e in list(raw_emails)[:5] if not _is_junk_email(e)]

    # Extract phones from tel: links (most reliable)
    tel_phones = set()
    for a_tag in soup.find_all("a", href=re.compile(r"^tel:", re.I)):
        phone = a_tag["href"].replace("tel:", "").strip()
        phone = re.sub(r"[^\d+]", "", phone)
        if phone and len(phone) >= 8:
            tel_phones.add(phone)

    # Extract phones from text (less reliable, but catches visible numbers)
    text_phones = set(PHONE_REGEX_AR.findall(text))
    # Clean up phone strings
    cleaned_phones = set()
    for p in text_phones:
        clean = re.sub(r"[^\d+]", "", p)
        if len(clean) >= 8:
            cleaned_phones.add(clean)

    result["phones"] = list(tel_phones | cleaned_phones)[:5]

    # Extract WhatsApp numbers
    whatsapps = set()
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        wa_match = WHATSAPP_LINK_REGEX.search(href)
        if wa_match:
            whatsapps.add(wa_match.group(1))

    # Also search raw HTML for wa.me links
    for wa_match in WHATSAPP_LINK_REGEX.finditer(html):
        whatsapps.add(wa_match.group(1))

    result["whatsapps"] = list(whatsapps)[:3]

    return result
