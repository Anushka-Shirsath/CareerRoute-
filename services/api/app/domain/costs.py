INSTITUTIONAL = ('tuition', 'development_fee', 'exam_fee', 'other_institutional')
VERIFIED = {'official_source', 'institution_source'}


def cost_split(fees, academic_year, assumptions):
    lines, unknown = [], []
    verified_total = estimated_personal = 0
    warnings = []
    applicable = [f for f in fees if f['academic_year'] == academic_year]
    if len(applicable) != len(fees):
        warnings.append('Fees from other academic years were excluded.')
    for kind in INSTITUTIONAL:
        records = [f for f in applicable if f['kind'] == kind and f.get('amount_inr') is not None and f.get('status') in VERIFIED and f.get('source_id')]
        # Conflicting versions are unknown until reviewed, never averaged.
        if len({(f['amount_inr'], f.get('per', 'year')) for f in records}) == 1:
            row = records[0]
            amount = row['amount_inr']
            if amount == 0 and not row.get('officially_free_note'):
                records = []
            else:
                amount *= 2 if row.get('per') == 'semester' else 1
                verified_total += amount
                lines.append({**row, 'annualized_amount_inr': amount, 'period_note': 'First-year total' if row.get('per') == 'one_time' else 'Annual amount'})
                continue
        unknown.append(kind)
        lines.append({'kind': kind, 'amount_inr': None, 'status': 'unknown', 'academic_year': academic_year, 'source_id': None})
    months = assumptions.get('months', 10)
    for key, kind in [('hostel_monthly', 'hostel'), ('food_monthly', 'mess_food'), ('transport_monthly', 'local_transport'), ('travel_home_monthly', 'travel_home'), ('books_supplies', 'books_supplies')]:
        hostel_records = [f for f in applicable if kind == 'hostel' and f['kind'] == 'hostel' and f.get('status') in VERIFIED and f.get('source_id') and f.get('amount_inr') is not None]
        if len(hostel_records) == 1:
            row = hostel_records[0]
            if row['amount_inr'] != 0 or row.get('officially_free_note'):
                amount = row['amount_inr'] * (2 if row.get('per') == 'semester' else 1)
                verified_total += amount
                lines.append({**row, 'annualized_amount_inr': amount})
                continue
        amount = assumptions.get(key)
        annual = amount * (1 if key == 'books_supplies' else months) if amount is not None else None
        if annual is None:
            unknown.append(kind)
        else:
            estimated_personal += annual
        lines.append({'kind': kind, 'amount_inr': annual, 'status': 'estimate' if annual is not None else 'unknown', 'assumption': 'Student estimate', 'academic_year': academic_year, 'source_id': None})
    return {'academic_year': academic_year, 'lines': lines, 'verified_institutional_total': round(verified_total, 2), 'estimated_personal_total': round(estimated_personal, 2), 'estimated_total': round(verified_total + estimated_personal, 2), 'unknown_lines': unknown, 'total_label': 'at least' if any(k in INSTITUTIONAL for k in unknown) else 'Estimated total', 'warnings': warnings, 'assumptions': assumptions}
