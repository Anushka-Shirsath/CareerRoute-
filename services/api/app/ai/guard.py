import json
import re
from decimal import Decimal

BANNED = re.compile(r'(?:\d+\s*%\s*(?:chance|probability)|guarantee(?:d)?|likely to get in|pakka|नक्की मिळेल|ज़रूर मिलेगा|पक्का|प्रवेशाची शक्यता\s*\d+|\d+\s*%\s*(?:शक्यता|संभावना))', re.I)
IDENTIFIER = re.compile(r'\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b(?:dump|csv|profile|memory):[\w:-]+|\bselect\s.+\sfrom\s', re.I)
INSTITUTION = re.compile(r'\b(?:[A-Z][\w&.\'-]*\s+){0,12}(?:College|Polytechnic|Institute|ITI|University)\b', re.I)
# Words that describe a kind of institution rather than name one, e.g. "a Private ITI".
GENERIC_WORDS = {'government', 'private', 'aided', 'unaided', 'un-aided', 'self-financed', 'self', 'financed', 'junior', 'senior', 'diploma', 'engineering', 'any', 'other', 'nearby', 'local', 'state', 'public', 'technical', 'or', 'and', 'college', 'colleges', 'polytechnic', 'polytechnics', 'institute', 'institutes', 'iti', 'itis', 'university'}
PRIVATE_KEYS = {'category', 'category_code', 'applies_to_category', 'quota', 'extra_dimensions', 'reservation_details', 'user_id', 'token_hash', 'display_name'}

INTERNAL_NAME = re.compile(r'`?\b(?:public\.)?cq_[\w.]+`?', re.I)


def scrub(reply):
    """Replace internal table or schema names with a plain description."""
    return INTERNAL_NAME.sub('the college database', reply)


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
    # Amounts may also be quoted inside evidence text, such as a scholarship's benefit summary.
    evidence_digits = set(re.findall(r'\d+(?:\.\d+)?', serialized.replace(',', '')))
    for amount in re.findall(r'(?:₹|INR|Rs\.?|rupees)\s*([\d,]+(?:\.\d+)?)', reply, flags=re.I):
        if float(amount.replace(',', '')) not in amounts and amount.replace(',', '') not in evidence_digits:
            return False
    remaining = reply
    for name in sorted(names, key=len, reverse=True):
        remaining = re.sub(re.escape(name), '[verified entity]', remaining, flags=re.I)
    remaining = re.sub(r'\b(?:this|that|the|your|a|an|each|these|those)\s+(?:college|institution|institute|polytechnic|ITI|university)\b', '[institution reference]', remaining, flags=re.I)
    for entity in INSTITUTION.findall(remaining):
        # Case-insensitive exact substring, with whitespace normalized.
        # Names are capitalised: keep only the capitalised run before the kind word, so prose
        # such as "can be continued into polytechnic" is not read as a name.
        words = entity.split()
        name = [words.pop()]
        while words and (words[-1][:1].isupper() or words[-1][:1] in '&(' or words[-1] in {'of', 'and', 'the', '&'}):
            name.insert(0, words.pop())
        words = name
        normalized = ' '.join(word.casefold() for word in words)
        if all(word in GENERIC_WORDS for word in re.split(r'[\s/]+', normalized) if word):
            continue
        haystack = ' '.join(serialized.casefold().split())
        # A capitalised sentence opener ("Then Sanjay Modak College") must not hide a real name.
        if not any(' '.join(w.casefold() for w in words[i:]) in haystack and any(w.casefold().strip(',.') not in GENERIC_WORDS for w in words[i:]) for i in range(max(1, len(words) - 1))):
            return False
    return True

