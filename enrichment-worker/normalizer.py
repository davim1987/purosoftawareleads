import phonenumbers
from email_validator import validate_email, EmailNotValidError


def normalize_phone(raw: str, default_region: str = "AR") -> tuple[str, bool]:
    """
    Normalize a phone number to E.164 format.
    Returns (normalized_value, is_valid).
    """
    # Clean common prefixes/noise
    cleaned = raw.strip().replace(" ", "").replace("-", "").replace(".", "")

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
    Normalize a WhatsApp number. Same as phone normalization
    but categorized differently in the database.
    """
    return normalize_phone(raw, default_region)


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
