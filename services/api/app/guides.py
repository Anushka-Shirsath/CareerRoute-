from .domain.results import PATHWAYS
from .errors import Problem

PORTALS = {'fyjc': 'https://mahafyjcadmissions.in/', 'polytechnic_diploma': 'https://dte.maharashtra.gov.in/', 'iti_trade': 'https://admission.dvet.gov.in/', 'vocational': 'https://msbsvet.edu.in/'}


def guide(pathway_id):
    if pathway_id not in PATHWAYS:
        raise Problem('NOT_FOUND', 'Pathway not found.', 404)
    return {'pathway_id': pathway_id, 'portal_url': PORTALS['fyjc' if pathway_id.startswith('fyjc_') else pathway_id], 'dates': None, 'date_note': 'Check the current official portal for dates and required documents.', 'checklist': [{'label_key': x, 'verification_status': 'unknown', 'note': 'Preparation reminder; verify current requirements on the official portal.'} for x in ['review_official_admission_rules', 'prepare_result_copy', 'check_identity_and_residence_documents', 'check_optional_category_documents_if_applicable', 'compare_programs_and_costs', 'apply_yourself_on_official_portal']], 'notice': 'CareerQuest does not submit applications or payments.'}
