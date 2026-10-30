from copy import deepcopy
from itertools import product
from pathlib import Path
import pytest
import yaml
from app.content import mission
from app.domain.compass import answer, current_node, report


def play(choices=None, rating=3, outcome=None):
    state = {'state': 'in_progress', 'position': 0, 'events': []}
    while (node := current_node(mission(), state)):
        event = {'node_id': node['id'], 'option_ids': [], 'idempotency_key': 'test-' + node['id']}
        if node['type'] in {'choice', 'multi_select', 'values'}:
            index = (choices or {}).get(node['id'], 0)
            event['option_ids'] = [node['options'][index]['id']]
        elif node['type'] == 'rating':
            event['rating'] = rating
        else:
            event['task_outcome'] = outcome or {'correct': True}
        state = answer(mission(), state, event, 'event-' + node['id'])
    return state


def test_graph_ids_match_across_locales():
    folder = Path(__file__).parents[2] / 'app/content/compass'
    signatures = []
    for locale in ('en', 'mr', 'hi'):
        content = yaml.safe_load((folder / f'mission1.{locale}.yaml').read_text(encoding='utf-8'))
        signatures.append([(n['id'], [o['id'] for o in n['options']]) for n in content['nodes']])
    assert signatures[0] == signatures[1] == signatures[2]


def test_every_path_reaches_done():
    # Exhaust all 3,125 combinations across S1-S5, including the reflection between them.
    for choices in product(range(5), repeat=5):
        state = play(dict(zip(['S1', 'S2', 'S3', 'S4', 'S5'], choices)))
        assert state['state'] == 'completed' and state['position'] == 10


def test_contrasting_paths_differ():
    pm = play({'S1': 0, 'S2': 1, 'S3': 2, 'S4': 1, 'S5': 3, 'S6': 1})
    cr = play({'S1': 2, 'S2': 2, 'S3': 4, 'S4': 0, 'S5': 4, 'S6': 2})
    assert report(pm['events'])['top_routes'][0]['pathway_id'] in {'polytechnic_diploma', 'iti_trade'}
    assert report(cr['events'])['top_routes'][0]['pathway_id'] == 'fyjc_arts'


def test_task_outcome_ignored():
    a = report(play(outcome={'correct': True})['events'])
    b = report(play(outcome={'correct': False, 'attempts': 99})['events'])
    assert a == b


def test_enjoy_only_mt_dimension():
    low = report(play(rating=1)['events'])
    high_state = play(rating=5)
    high = report(high_state['events'])
    dimension = next(e['dimension'] for e in high_state['events'] if e['node_id'] == 'MT_RATE')
    assert [d['code'] for d, h in zip(low['dimensions'], high['dimensions']) if d != h] == [dimension]


def test_stop_after_s2_is_early():
    value = report(play()['events'][:2])
    assert value['coverage'] == 'early'


def test_marks_only_not_ranked():
    value = report([], {'subjects': []})
    assert value['mode'] == 'marks_only' and not value['ranked']
    assert all(r['score'] is None for r in value['top_routes'])


def test_values_cap():
    state = play()
    events = deepcopy(state['events'])
    events[-1]['selected'] = [{'id': x, 'tags': {}, 'text': x} for x in ['earn_early', 'creative_freedom']]
    assert all(r['values_modifier'] <= .10 for r in report(events)['top_routes'])


def test_ruleset_version_pinned():
    assert mission()['ruleset'] == 'v0.1'


@pytest.mark.parametrize('node', ['S1', 'S2', 'S3', 'R1', 'S4', 'S5', 'MT', 'MT_RATE', 'S6', 'V1'])
def test_every_node_skippable(node):
    state = {'state': 'in_progress', 'position': 0, 'events': []}
    while current_node(mission(), state):
        current = current_node(mission(), state)
        state = answer(mission(), state, {'node_id': current['id'], 'skip': True, 'option_ids': [], 'idempotency_key': current['id'] + 'skip-key'}, current['id'])
    assert state['state'] == 'completed'

