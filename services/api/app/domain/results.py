from collections import defaultdict

PATHWAYS = ('fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma', 'iti_trade', 'vocational')
AGGREGATE_LABEL = 'Average of the subjects you entered (not an official aggregate)'


def snapshot(result):
    if not result or result.get('confirmation_state') != 'confirmed':
        return None
    subjects = [{**s, 'percentage': round(100 * s['obtained'] / s['maximum'], 2) if s.get('obtained') is not None and s.get('maximum') else None} for s in result['subjects']]
    measured = [s for s in subjects if s['percentage'] is not None]
    average = round(sum(s['percentage'] for s in measured) / len(measured), 2) if measured else None
    ordered = sorted(measured, key=lambda s: (-s['percentage'], s['name_as_shown']))
    return {'board': result.get('board'), 'exam_year': result.get('exam_year'), 'result_type': result.get('result_type'), 'is_synthetic': result.get('is_synthetic', False), 'subjects': subjects, 'aggregate': {'value': average, 'method': 'simple_average_entered', 'label': AGGREGATE_LABEL, 'merit_metric': None}, 'strengths': [s['name_as_shown'] for s in ordered[:2]], 'observations': ['Marks describe this result, and can change with preparation.', 'All six routes are worth exploring; admission requirements must be checked separately.'], 'routes_kept_open': list(PATHWAYS)}


def readiness(academic, route):
    groups = {'fyjc_science': ['mathematics', 'science'], 'polytechnic_diploma': ['mathematics', 'science'], 'fyjc_commerce': ['mathematics', 'english'], 'fyjc_arts': ['languages', 'social_science']}
    required = groups.get(route, [])
    if not required:
        return {'band': 'not_available', 'subjects': [], 'average': None, 'text': 'No specific subject requirement in our data.'}
    marks = defaultdict(list)
    for s in (academic or {}).get('subjects', []):
        if s['percentage'] is not None:
            key = s['canonical_subject']
            marks[key].append(s['percentage'])
            if key in {'first_language', 'second_language', 'third_language', 'english'}:
                marks['languages'].append(s['percentage'])
    averages = [sum(marks[s]) / len(marks[s]) for s in required if marks[s]]
    average = round(sum(averages) / len(averages), 2) if len(averages) == len(required) else None
    band = 'not_available' if average is None else 'strong' if average >= 75 else 'moderate' if average >= 50 else 'limited'
    return {'band': band, 'subjects': required, 'average': average, 'text': 'Your marks are one starting point. You can explore this route and discuss preparation with a teacher.'}
