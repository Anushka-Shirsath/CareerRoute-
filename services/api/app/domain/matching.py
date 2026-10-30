from .results import PATHWAYS

RANKER_VERSION = 'v1.0'


def eligibility(facts, academic):
    rules = facts.get('eligibility_rules')
    if not rules or not rules.get('source_id') or rules.get('academic_year') != facts.get('academic_year'):
        return 'rules_not_verified'
    if not academic:
        return 'needs_more_info'
    missing = False
    for requirement in rules.get('requirements', []):
        subject = requirement.get('subject')
        matches = [s['percentage'] for s in academic['subjects'] if s['canonical_subject'] == subject and s['percentage'] is not None]
        if not matches:
            missing = True
        elif sum(matches) / len(matches) < requirement['minimum_percent']:
            return 'not_eligible'
    return 'needs_more_info' if missing else 'eligible_by_known_rules'


def cutoff_comparison(facts, academic, category, context):
    records = facts.get('cutoffs', [])
    if not records and not facts.get('cutoff_count'):
        return {'status': 'no_cutoff_record', 'reason': None, 'record': None}
    def no(reason):
        return {'status': 'not_comparable', 'reason': reason, 'record': None}
    if not academic:
        return no('RESULT_NOT_CONFIRMED')
    if not category:
        return no('CATEGORY_NOT_PROVIDED')
    if not context or not context.get('round'):
        return no('ROUND_NOT_SELECTED')
    records = [r for r in records if r['academic_year'] == context['academic_year']]
    if not records:
        return no('YEAR_NOT_AVAILABLE')
    records = [r for r in records if r.get('admission_system') == context['admission_system'] and r['round'] == context['round'] and r['category'] == category and r.get('quota') == context.get('quota') and r.get('quota') is not None and r.get('extra_dimensions', {}) == context.get('extra_dimensions', {})]
    if not records:
        return no('QUOTA_MISMATCH')
    aggregate = academic.get('aggregate', {})
    if not aggregate.get('merit_metric'):
        return no('AGGREGATE_RULE_UNVERIFIED')
    records = [r for r in records if r.get('merit_metric') == aggregate['merit_metric'] == context.get('merit_metric') and r.get('numeric_value') is not None]
    if not records:
        return no('METRIC_MISMATCH')
    # Never choose one of several conflicting source records silently.
    if len({r['numeric_value'] for r in records}) != 1:
        return no('METRIC_MISMATCH')
    record = sorted(records, key=lambda r: r.get('source_id', ''))[0]
    return {'status': 'comparable', 'reason': None, 'record': record, 'student_metric': aggregate['value'], 'caveat': 'Past cutoffs do not predict future admission.'}


def evaluate(facts, profile, preferences, academic, category, context=None):
    comparison = cutoff_comparison(facts, academic, category, context)
    cap = preferences.get('tuition_cap_inr')
    fee = facts.get('tuition')
    affordability = None if fee is None or cap is None else (1 if fee == 0 else 0) if cap == 0 else max(0, min(1, 2 * (1 - fee / cap)))
    district, home = facts.get('district'), profile.get('home_district')
    proximity = None
    if facts.get('city') and profile.get('home_city') and facts['city'].casefold() == profile['home_city'].casefold():
        proximity = 1
    elif district and home and district.casefold() == home.casefold():
        proximity = .6
    elif district and district.casefold() in [d.casefold() for d in preferences.get('target_districts', [])]:
        proximity = .3
    academic_fit = None
    if comparison['status'] == 'comparable':
        gap = comparison['student_metric'] - comparison['record']['numeric_value']
        academic_fit = 1 if gap >= 0 else .5 if gap >= -5 else 0
    management = facts.get('management', 'unknown')
    hostel = facts.get('hostel_status', 'unknown')
    values = {'affordability': affordability, 'proximity': proximity, 'government': None if management == 'unknown' else float(management in {'government', 'government_aided'}), 'hostel': None if hostel == 'unknown' else float(hostel == 'available'), 'medium': None if not facts.get('medium') or not preferences.get('medium') else float(facts['medium'].casefold() == preferences['medium'].casefold()), 'academic_fit': academic_fit}
    weights = preferences.get('weights', {})
    total = sum(weights.values())
    measured = sum(w for name, w in weights.items() if values.get(name) is not None)
    utility = sum(w * values[name] for name, w in weights.items() if values.get(name) is not None) / measured if measured else None
    return {'offering_id': facts['id'], 'name': facts['name'], 'pathway_id': facts['pathway_id'], 'eligibility_status': eligibility(facts, academic), 'cutoff_comparison': comparison, 'utility': round(utility, 6) if utility is not None else None, 'evidence_coverage': round(measured / total, 6) if total else 0, 'components': [{'criterion': name, 'weight': weight, 'value': values.get(name)} for name, weight in weights.items()], 'unrated_criteria': [k for k in weights if values.get(k) is None], 'ranker_version': RANKER_VERSION, 'weights': weights, 'facts': facts}


def ranked_search(offerings, profile, preferences, academic, category, context=None):
    groups = {'main': [], 'hostel_unknown': [], 'fee_unknown': []}
    excluded = 0
    for facts in offerings:
        if preferences.get('pathway') and facts['pathway_id'] != preferences['pathway']:
            continue
        targets = preferences.get('target_districts', [])
        if targets and (not facts.get('district') or facts['district'].casefold() not in [d.casefold() for d in targets]):
            continue
        if preferences.get('government') == 'only' and facts.get('management') not in {'government', 'government_aided'}:
            excluded += 1
            continue
        if preferences.get('medium_required') and (facts.get('medium') or '').casefold() != (preferences.get('medium') or '').casefold():
            excluded += 1
            continue
        row = evaluate(facts, profile, preferences, academic, category, context)
        if row['eligibility_status'] == 'not_eligible':
            excluded += 1
            continue
        group = 'main'
        if preferences.get('hostel') == 'required':
            if facts.get('hostel_status') == 'not_available':
                excluded += 1
                continue
            if facts.get('hostel_status', 'unknown') == 'unknown':
                group = 'hostel_unknown'
        if preferences.get('cap_is_hard') and preferences.get('tuition_cap_inr') is not None:
            if facts.get('tuition') is None:
                group = 'fee_unknown'
            elif facts['tuition'] > preferences['tuition_cap_inr']:
                excluded += 1
                continue
        row['unknown_filter_reasons'] = (['Hostel not verified'] if preferences.get('hostel') == 'required' and facts.get('hostel_status', 'unknown') == 'unknown' else []) + (['Fee not verified'] if preferences.get('cap_is_hard') and facts.get('tuition') is None else [])
        groups[group].append(row)
    def key(row):
        return (-(row['utility'] if row['utility'] is not None else -1), -row['evidence_coverage'], row['name'].casefold(), row['offering_id'])
    for rows in groups.values():
        rows.sort(key=key)
    results = groups['main'] + groups['hostel_unknown'] + groups['fee_unknown']
    return {'results': results, 'groups': groups, 'excluded_count': excluded, 'ranker_version': RANKER_VERSION, 'weights': preferences.get('weights', {}), 'relaxation_hints': [] if groups['main'] else ['Review the fee or hostel unknown groups.', 'Try another district or soften a required preference.'], 'pathways': list(PATHWAYS)}
