import phonenumbers
from email_validator import validate_email, EmailNotValidError


def normalize_phone(raw: str, default_region: str = "AR") -> tuple[str, bool]:
    """
    Normalize a phone number to E.164 format.
    Returns (normalized_value, is_valid).
    """
    # Clean common prefixes/noise
    cleaned = raw.strip().replace(" ", "").replace("-", "").replace(".", "").replace("(", "").replace(")", "")

    # Fix common Argentine formatting issues:
    # - Remove leading 0 from area codes: 011 → 11, 0351 → 351
    # - Only if it doesn't already have a country code
    if not cleaned.startswith("+"):
        cleaned = cleaned.lstrip("0")
        # If it's just digits without country code, prepend +54
        if cleaned.isdigit() and len(cleaned) >= 8:
            cleaned = "+54" + cleaned

    try:
        parsed = phonenumbers.parse(cleaned, default_region)
        is_valid = phonenumbers.is_valid_number(parsed)
        normalized = phonenumbers.format_number(
            parsed, phonenumbers.PhoneNumberFormat.E164
        )
        return normalized, is_valid
    except phonenumbers.NumberParseException:
        return raw.strip(), False


def normalize_email(raw: str) -> tuple[str, bool]:
    """
    Validate and normalize an email address.
    Returns (normalized_value, is_valid).
    """
    try:
        result = validate_email(raw.strip(), check_deliverability=False)
        return result.normalized, True
    except EmailNotValidError:
        return raw.strip().lower(), False


def normalize_whatsapp(raw: str, default_region: str = "AR") -> tuple[str, bool]:
    """
    Normalize a WhatsApp number for Argentina.
    WhatsApp requires +54 9 CODE NUMBER for mobile numbers.
    E.g.: +54 9 11 1234-5678 (Buenos Aires mobile)
    """
    normalized, is_valid = normalize_phone(raw, default_region)
    if is_valid and normalized.startswith("+54"):
        digits = normalized[3:]  # Remove +54
        # Argentine mobile numbers need a 9 after country code for WhatsApp
        # Full mobile: +54 9 XX XXXX XXXX (11 digits after +54 with the 9)
        # If we have 10 digits without the 9, add it
        if not digits.startswith("9") and len(digits) == 10:
            normalized = "+549" + digits
    return normalized, is_valid


def compute_confidence(contact_type: str, is_valid: bool, source: str) -> float:
    """
    Compute a confidence score (0-1) for a contact.
    Higher confidence for validated data from primary sources.
    """
    base = 0.5

    # Validity bonus
    if is_valid:
        base += 0.3

    # Source bonus
    if source and ("mailto:" in source or "tel:" in source):
        base += 0.1  # Explicit link = higher confidence
    if source and "wa.me" in source:
        base += 0.1  # WhatsApp link = high confidence

    return min(base, 1.0)
