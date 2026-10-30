import json
from pathlib import Path
import pytest
from app.ai.guard import postcheck, sanitize
from app.ai.mentor import fallback
from app.ai.tools import TOOLS


def test_tools_take_no_user_id():
    text = json.dumps(TOOLS)
    assert 'user_id' not in text and 'student_id' not in text


def test_tools_cap_records():
    assert len(sanitize(list(range(100)))) == 10


def test_sensitive_table_not_referenced_in_ai_package():
    folder = Path(__file__).parents[2] / 'app/ai'
    for path in folder.rglob('*.py'):
        assert 'student_sensitive_attributes' not in path.read_text(encoding='utf-8')


@pytest.mark.parametrize('text', ['You have a 90% chance', 'Guaranteed admission', 'pakka', 'नक्की मिळेल', 'ज़रूर मिलेगा', '90% संभावना'])
def test_postcheck_blocks_chance_language(text):
    assert not postcheck(text, [])


def test_postcheck_blocks_unseen_rupee_amount():
    assert not postcheck('The fee is ₹30,000', [{'amount_inr': 1000}])


def test_postcheck_blocks_unseen_institution():
    assert not postcheck('Sunrise Polytechnic has a hostel.', [{'name': 'Other Institute'}])


def test_postcheck_accepts_grounded_rupee_amount():
    assert postcheck('The published fee is ₹1,000.', [{'amount_inr': 1000}])


def test_fallback_has_actions_in_all_languages():
    for locale in ['en', 'mr', 'hi']:
        value = fallback(locale)
        assert value['fallback'] and len(value['actions']) == 3


def test_nested_sensitive_attributes_removed():
    assert sanitize({'record': {'category': 'PRIVATE', 'quota': 'PRIVATE', 'amount': 10}}) == {'record': {'amount': 10}}
