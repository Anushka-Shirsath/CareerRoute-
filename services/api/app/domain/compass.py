from collections import defaultdict
from copy import deepcopy
from .results import PATHWAYS, readiness
from ..errors import Problem

DIMENSIONS = ('AN', 'PM', 'CR', 'EN', 'SO')
MATRIX = dict(zip(PATHWAYS, [(1, .5, .2, .2, .4), (.6, .1, .2, 1, .4), (.4, .1, 1, .3, .9), (.6, 1, .4, .3, .1), (.2, 1, .3, .3, .2), (.2, .8, .5, .6, .5)]))
MODIFIERS = {'earn_early': ('polytechnic_diploma', 'iti_trade', 'vocational'), 'deep_study': ('fyjc_science', 'fyjc_arts'), 'creative_freedom': ('fyjc_arts', 'vocational'), 'own_business': ('fyjc_commerce', 'vocational'), 'helping_people': ('fyjc_arts', 'fyjc_science'), 'stay_near_home': ()}


def current_node(mission, session):
    if session.get('state') in {'completed', 'abandoned'}:
        return None
    index = session['position']
    if index >= len(mission['nodes']):
        return None
    node = deepcopy(mission['nodes'][index])
    events = session['events']
    if node['id'] == 'R1':
        node['options'] = [{'id': 'R1.' + o['id'], 'text': o['text'], 'tags': o['tags']} for e in events if e['node_id'] in {'S1', 'S2', 'S3'} for o in e.get('selected', [])] + [{'id': 'R1.none', 'text': 'None of these', 'tags': {}}]
    if node['id'] in {'MT', 'MT_RATE'}:
        raw = defaultdict(float)
        for e in events:
            if e['node_id'] in {'S1', 'S2', 'S3', 'S4', 'S5'}:
                for o in e.get('selected', []):
                    for d, w in o['tags'].items():
                        raw[d] += w
        dimension = min(DIMENSIONS, key=lambda d: raw[d])
        node['dimension'] = dimension
        if node['id'] == 'MT':
            node['task'] = mission['mini_tasks'][dimension]
    return node


def answer(mission, session, event, event_id):
    node = current_node(mission, session)
    if not node or session['state'] not in {'in_progress', 'paused'}:
        raise Problem('CONFLICT', 'This session has ended.', 409)
    if node['id'] != event['node_id']:
        raise Problem('CONFLICT', 'Answer the current node.', 409)
    ids = event.get('option_ids', [])
    if len(ids) != len(set(ids)):
        raise Problem('VALIDATION_FAILED', 'Duplicate options are not allowed.')
    selected = [o for o in node['options'] if o['id'] in ids]
    if len(selected) != len(ids):
        raise Problem('VALIDATION_FAILED', 'Option does not belong to this node.')
    if not event.get('skip'):
        if node['type'] == 'choice' and len(ids) != 1:
            raise Problem('VALIDATION_FAILED', 'Pick one option or skip.')
        if node['type'] == 'values' and not 1 <= len(ids) <= 2:
            raise Problem('VALIDATION_FAILED', 'Pick up to two values or skip.')
        if node['id'] == 'R1' and (not ids or 'R1.none' in ids and len(ids) > 1):
            raise Problem('VALIDATION_FAILED', 'Pick activities or choose none.')
        if node['type'] == 'rating' and event.get('rating') is None:
            raise Problem('VALIDATION_FAILED', 'Enter a rating or skip.')
        if node['type'] == 'minitask' and event.get('task_outcome') is None:
            raise Problem('VALIDATION_FAILED', 'Enter task outcome or skip.')
    if node['type'] not in {'rating'} and event.get('rating') is not None:
        raise Problem('VALIDATION_FAILED', 'Ratings belong to MT_RATE only.')
    if node['type'] != 'minitask' and event.get('task_outcome') is not None:
        raise Problem('VALIDATION_FAILED', 'Task outcomes belong to MT only.')
    if node['type'] in {'rating', 'minitask'} and ids:
        raise Problem('VALIDATION_FAILED', 'This node has no selectable options.')
    saved = {**event, 'id': event_id, 'selected': [] if event.get('skip') else selected, 'dimension': node.get('dimension')}
    new = deepcopy(session)
    new['events'].append(saved)
    new['position'] += 1
    if new['position'] == len(mission['nodes']):
        new['state'] = 'completed'
    return new


def report(events, academic=None, student_override=None):
    choices, stated, observations = defaultdict(float), defaultdict(float), defaultdict(int)
    trace = defaultdict(list)
    enjoy, values = {}, []
    choices_measured = stated_measured = False
    for e in events:
        if e.get('skip'):
            continue
        node = e['node_id']
        if node in {'R1', 'S6'}:
            stated_measured = True
        if node in {'S1', 'S2', 'S3', 'S4', 'S5'}:
            choices_measured = True
        touched = set()
        for o in e.get('selected', []):
            if node == 'V1':
                values.append(o['id'])
            for d, weight in o['tags'].items():
                if node in {'R1', 'S6'}:
                    stated[d] += weight * (.5 if node == 'R1' else 1)
                elif node in {'S1', 'S2', 'S3', 'S4', 'S5'}:
                    choices[d] += weight
                touched.add(d)
                trace[d].append({'text': o['text'], 'event_id': e['id'], 'evidence_type': 'stated_interest' if node in {'R1', 'S6'} else 'choice'})
        if node == 'MT_RATE' and e.get('rating') is not None:
            d = e['dimension']
            enjoy[d] = (e['rating'] - 1) / 4
            touched.add(d)
            trace[d].append({'text': 'You rated enjoyment of the exploration task.', 'event_id': e['id'], 'evidence_type': 'task_enjoyment'})
        for d in touched:
            observations[d] += 1
    maximum = max(choices.values(), default=0)
    evidence = {}
    for d in DIMENSIONS:
        parts = []
        if choices_measured:
            parts.append((.4, choices[d] / maximum if maximum else 0))
        if stated_measured:
            parts.append((.45, min(1, stated[d])))
        if d in enjoy:
            parts.append((.15, enjoy[d]))
        evidence[d] = sum(w * s for w, s in parts) / sum(w for w, _ in parts) if parts else 0
    covered = sum(observations[d] >= 2 for d in DIMENSIONS)
    coverage = 'good' if covered == 5 else 'developing' if covered >= 3 else 'early'
    routes = []
    for route in PATHWAYS:
        weights = MATRIX[route]
        modifier = min(.10, sum(.05 for v in values if route in MODIFIERS.get(v, ())))
        score = sum(w * evidence[d] for w, d in zip(weights, DIMENSIONS)) / sum(weights) + modifier
        ordered_dims = sorted(DIMENSIONS, key=lambda d: -weights[DIMENSIONS.index(d)] * evidence[d])
        why = []
        seen = set()
        for d in ordered_dims:
            for item in trace[d]:
                if item['event_id'] not in seen:
                    why.append(item)
                    seen.add(item['event_id'])
        routes.append({'pathway_id': route, 'score': round(score, 6) if events else None, 'values_modifier': round(modifier, 2), 'readiness': readiness(academic, route), 'why': why[:3], 'limited_evidence': len(why) < 2, 'close_call': False, 'watch_outs': ['Check the current official admission rules.'], 'try_next': 'Discuss the daily activities on this route with a teacher or student.'})
    if events:
        routes.sort(key=lambda r: (-r['score'], PATHWAYS.index(r['pathway_id'])))
        # Anchor tie groups avoid a non-transitive pairwise 0.03 comparison.
        bands = {'strong': 0, 'moderate': 1, 'limited': 2, 'not_available': 3}
        ranked = []
        while routes:
            anchor = routes[0]['score']
            group = [r for r in routes if anchor - r['score'] <= .03]
            routes = routes[len(group):]
            ranked.extend(sorted(group, key=lambda r: (bands[r['readiness']['band']], PATHWAYS.index(r['pathway_id']))))
        routes = ranked
        close = abs(routes[2]['score'] - routes[3]['score']) <= .03
        routes[2]['close_call'] = close
        top, alternatives = routes[:3], [r['pathway_id'] for r in routes[3:4]] if close else []
    else:
        top, alternatives = routes, []
    return {'ruleset': 'v0.1', 'mode': 'game_and_marks' if events and academic else 'game_only' if events else 'marks_only', 'coverage': coverage, 'dimensions': [{'code': d, 'evidence': round(evidence[d], 6), 'observations': observations[d]} for d in DIMENSIONS], 'values': values, 'proximity_hint': 'stay_near_home' in values, 'top_routes': top, 'alternatives': alternatives, 'student_override': student_override, 'ranked': bool(events), 'footer': 'Exploratory, team-authored v0.1 content and weights; not a validated psychometric instrument.'}
