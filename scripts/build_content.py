"""Write versioned, team-authored mission content from planning-pack v0.1."""
import json
from pathlib import Path

nodes = [
('S1', 'choice', "Your school's Innovation Festival is in 4 days. Your team needs you. What do you grab first?", [
('The toolbox. Someone has to build the model.', {'PM': 1}), ('The budget sheet. Let us see what we can afford.', {'EN': 1}), ('Sketch paper. The stall has to look amazing.', {'CR': 1}), ('The team list. I will make sure everyone knows their job.', {'SO': 1}), ('The judging rules. Let us find out what they score.', {'AN': 1})]),
('S2', 'choice', 'The night before, your working model stops working.', [
('Test each part one by one until I find the fault.', {'AN': 1}), ('Rebuild it fast with spare parts.', {'PM': 1}), ('Switch to a poster and short video that shows the idea.', {'CR': 1}), ('Calm the team and split the fixing work.', {'SO': 1}), ('Decide what we can drop and still have a good stall.', {'EN': 1})]),
('S3', 'choice', 'Supplies cost ₹600 more than your budget.', [
('Compare prices at three shops and work out the cheapest mix.', {'AN': .5, 'EN': .5}), ('Sell snacks at lunch to raise the money.', {'EN': 1}), ('Make parts from scrap.', {'PM': 1}), ('Explain the problem to a teacher and ask for help.', {'SO': 1}), ('Simplify the design so it costs less but still looks good.', {'CR': 1})]),
('R1', 'multi_select', 'Which activities would you happily do again? Pick any, or none.', []),
('S4', 'choice', 'Visitors keep walking away confused.', [
('Draw a clear diagram anyone can follow.', {'CR': 1}), ('Run a live demo every 10 minutes.', {'PM': 1}), ('Talk to each visitor and explain patiently.', {'SO': 1}), ('Ask five visitors what confused them, then fix that.', {'AN': 1}), ('Make a one-line pitch that pulls people in.', {'EN': 1})]),
('S5', 'choice', 'Two teammates disagree about the final design and time is running out.', [
('List the facts behind each idea and compare.', {'AN': 1}), ('Take a quick vote and move on.', {'EN': 1}), ('Talk to each of them privately first.', {'SO': 1}), ('Build a quick version of both and test.', {'PM': 1}), ('Combine the best parts into a new design.', {'CR': 1})]),
('MT', 'minitask', 'Try a different kind of activity. There is no timer pressure.', []),
('MT_RATE', 'rating', 'Did you enjoy that task? Rate from 1 to 5.', []),
('S6', 'choice', 'The principal asks you to lead one thing next year. You pick...', [
('The science and data corner', {'AN': 1}), ('The build workshop', {'PM': 1}), ('The art and design wall', {'CR': 1}), ('The stall business and sponsors', {'EN': 1}), ('The welcome and helper team', {'SO': 1})]),
('V1', 'values', 'What matters most in the next few years? Pick up to two.', [])]
values = [('earn_early', 'Start earning sooner'), ('deep_study', 'Study a subject deeply for years'), ('creative_freedom', 'Freedom to create'), ('helping_people', 'Helping people'), ('own_business', 'Running my own thing one day'), ('stay_near_home', 'Staying near home')]
mission = {'id': 'mission1', 'ruleset': 'v0.1', 'title': 'The School Innovation Festival', 'nodes': [{'id': nid, 'type': typ, 'text': text, 'options': [{'id': nid + '.' + chr(97 + i), 'text': label, 'tags': tags} for i, (label, tags) in enumerate(options)]} for nid, typ, text, options in nodes], 'mini_tasks': {
    'AN': {'text': 'Visitors per hour: 4, 8, 16, ? Pick 24, 32, or 20. What would you measure to know if the stall worked?', 'choices': ['24', '32', '20'], 'hint': 'Look for a repeated multiplication.'},
    'PM': {'text': 'Order the steps: switch off power; inspect the connection; secure the loose connection; switch on and test.', 'hint': 'Safety comes before inspection.'},
    'CR': {'text': 'Choose a poster layout for a 10-year-old: large diagram, photo story, or illustrated steps. Explain your choice.', 'hint': 'There is no right answer.'},
    'EN': {'text': 'Badges cost ₹10 each. At ₹15 sell 20; at ₹20 sell 18; at ₹30 sell 8. Which price earns the most?', 'hint': 'Compare (price minus cost) times quantity.'},
    'SO': {'text': 'A visitor is upset that their child broke a model. Choose: reassure and help; explain repair options; invite them to rebuild together.', 'hint': 'There is no right answer.'}}}
mission['nodes'][-1]['options'] = [{'id': code, 'text': label, 'tags': {}} for code, label in values]
folder = Path('services/api/app/content/compass')
folder.mkdir(parents=True, exist_ok=True)
(folder / 'mission1.en.yaml').write_text(json.dumps(mission, indent=2, ensure_ascii=False), encoding='utf-8')
# Translations have matching IDs; English is an explicit fallback pending human review.
for locale in ('mr', 'hi'):
    translated = {'id': 'mission1', 'locale': locale, 'translation_status': 'english_fallback_pending_human_translation', 'nodes': [{k: n[k] for k in ('id', 'type', 'text', 'options')} for n in mission['nodes']]}
    (folder / f'mission1.{locale}.yaml').write_text(json.dumps(translated, indent=2, ensure_ascii=False), encoding='utf-8')

