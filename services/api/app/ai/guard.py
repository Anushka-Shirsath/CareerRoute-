import json
import re
from decimal import Decimal

BANNED = re.compile(r'(?:\d+\s*%\s*(?:chance|probability)|guarantee(?:d)?|likely to get in|pakka|नक्की मिळेल|ज़रूर मिलेगा|पक्का|प्रवेशाची शक्यता\s*\d+|\d+\s*%\s*(?:शक्यता|संभावना))', re.I)
IDENTIFIER = re.compile(r'\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b(?:dump|csv|profile|memory):[\w:-]+', re.I)
INSTITUTION = re.compile(r'\b(?:[A-Z][\w&.\'-]*\s+){0,12}(?:College|Polytechnic|Institute|ITI|University)\b', re.I)
PRIVATE_KEYS = {'category', 'category_code', 'applies_to_category', 'quota', 'extra_dimensions', 'reservation_details', 'user_id', 'token_hash', 'display_name'}


def sanitize(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items() if k not in PRIVATE_KEYS}
    if isinstance(value, list):
        return [sanitize(v) for v in value[:10]]
    return value


def postcheck(reply, outputs, tool_names=()):
    serialized = json.dumps(outputs, ensure_ascii=False)
    if BANNED.search(reply) or IDENTIFIER.search(reply):
        return False
    if any(name in reply for name in tool_names):
        return False
    # All numbers, including fees and dates, must appear in this turn's evidence.
    amounts = []
    names = []
    def evidence(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {'amount_inr', 'annualized_amount_inr', 'tuition', 'tuition_cap_inr', 'verified_institutional_total', 'estimated_personal_total', 'estimated_total'} and isinstance(item, (int, float)):
                    amounts.append(float(item))
                if key in {'name', 'institution_name'} and isinstance(item, str):
                    names.append(item)
                if key == 'value' and str(value.get('unit', '')).startswith('INR') and isinstance(item, (int, float)):
                    amounts.append(float(item))
                evidence(item)
        elif isinstance(value, list):
            for item in value:
                evidence(item)
    evidence(outputs)
    for amount in re.findall(r'(?:₹|INR|Rs\.?|rupees)\s*([\d,]+(?:\.\d+)?)', reply, flags=re.I):
        if float(amount.replace(',', '')) not in amounts:
            return False
    remaining = reply
    for name in sorted(names, key=len, reverse=True):
        remaining = re.sub(re.escape(name), '[verified entity]', remaining, flags=re.I)
    remaining = re.sub(r'\b(?:this|that|the|your|a|an|each|these|those)\s+(?:college|institution|institute|polytechnic|ITI|university)\b', '[institution reference]', remaining, flags=re.I)
    for entity in INSTITUTION.findall(remaining):
        # Case-insensitive exact substring, with whitespace normalized.
        normalized = ' '.join(entity.casefold().split())
        if normalized not in ' '.join(serialized.casefold().split()):
            return False
    return True

