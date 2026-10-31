-- One row per program, category and latest year: first-round and closing cutoffs as a
-- percentage. Built from the master so marks-based suggestions stay fast under RLS.
-- FYJC values are merit marks out of 500; Polytechnic values are CAP merit percentages.
DROP TABLE IF EXISTS public.cq_cutoff_summary;
CREATE TABLE public.cq_cutoff_summary (
  offering_id text NOT NULL,
  pathway_id text NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  program_name text NOT NULL,
  district text,
  management text,
  academic_year text NOT NULL,
  first_round_percent numeric NOT NULL,
  closing_percent numeric NOT NULL,
  rounds integer NOT NULL,
  source_url text,
  PRIMARY KEY (offering_id, category)
);

INSERT INTO public.cq_cutoff_summary
WITH scoped AS (
  SELECT ip.id, i.institution_id, i.name, d.name AS district, i.management, p.name AS stream,
         cy.academic_year, c.cutoff_value_num AS value, a.value AS category,
         max(cy.academic_year) OVER (PARTITION BY i.institution_id, p.name, a.value) AS latest_year
  FROM cq_master_v11._cq_cutoffs c
  JOIN cq_master_v11.institution_programs ip ON ip.id=c.institution_program_id
  JOIN cq_master_v11.institutions i ON i.institution_id=ip.institution_id
  JOIN cq_master_v11.programs p ON p.program_id=ip.program_id
  LEFT JOIN cq_master_v11.districts d ON d.district_id=i.district_id
  JOIN cq_master_v11._cq_cutoff_categories a ON a.id=c.category_key
  JOIN cq_master_v11._cq_cutoff_reservations b ON b.id=c.reservation_key
  JOIN cq_master_v11.admission_cycles cy ON cy.cycle_id=c.cycle_id
  WHERE i.pathway='fyjc' AND (b.value IS NULL OR b.value IN ('','Remaining seats (Pure)'))
    AND c.cutoff_value_num BETWEEN 0 AND 500 AND p.name IN ('Science','Commerce','Arts')
)
SELECT 'dump:' || id, 'fyjc_' || lower(stream), upper(category), name, stream, district, management, academic_year,
       round(max(value)/5, 2), round(min(value)/5, 2), count(*), NULL
FROM scoped WHERE academic_year=latest_year
GROUP BY id, stream, category, name, district, management, academic_year;

-- Seat codes look like NGOPENH: N/T background, G/L gender, category, H/O/S home region.
-- Only general-gender non-technical codes are summarised, mapped to FYJC category names.
INSERT INTO public.cq_cutoff_summary
WITH unique_choices AS (
  SELECT choice_code, min(id) AS id FROM cq_master_v11.institution_programs
  WHERE choice_code IS NOT NULL AND choice_code<>'' GROUP BY choice_code HAVING count(DISTINCT id)=1
), scoped AS (
  SELECT ip.id, i.name, d.name AS district, i.management, p.name AS program_name, c.academic_year,
         c.merit_percent AS value, s.url AS source_url,
         CASE substring(c.seat_type_raw FROM '^NG([A-Z]+)[HOS]$') WHEN 'OPEN' THEN 'GENERAL' WHEN 'VJ' THEN 'VJA'
              ELSE substring(c.seat_type_raw FROM '^NG([A-Z]+)[HOS]$') END AS category
  FROM cq_master_v11.polytechnic_cap_cutoffs_source c
  JOIN unique_choices u ON u.choice_code=c.choice_code_raw
  JOIN cq_master_v11.institution_programs ip ON ip.id=u.id
  JOIN cq_master_v11.institutions i ON i.institution_id=ip.institution_id
  JOIN cq_master_v11.programs p ON p.program_id=ip.program_id
  LEFT JOIN cq_master_v11.districts d ON d.district_id=i.district_id
  LEFT JOIN cq_master_v11.source_documents s ON s.source_id=c.source_id
  WHERE c.seat_type_raw ~ '^NG[A-Z]+[HOS]$' AND c.merit_percent BETWEEN 0 AND 100
), latest AS (
  SELECT *, max(academic_year) OVER (PARTITION BY id, category) AS latest_year FROM scoped
)
SELECT 'dump:' || id, 'polytechnic_diploma', category, name, program_name, district, management, academic_year,
       round(max(value), 2), round(min(value), 2), count(*), min(source_url)
FROM latest WHERE academic_year=latest_year
GROUP BY id, category, name, program_name, district, management, academic_year;

CREATE INDEX cq_cutoff_summary_lookup ON public.cq_cutoff_summary (category, pathway_id, closing_percent);
CREATE INDEX cq_cutoff_summary_district ON public.cq_cutoff_summary (district);

ALTER TABLE public.cq_cutoff_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cq_cutoff_summary FORCE ROW LEVEL SECURITY;
CREATE POLICY cq_cutoff_summary_read ON public.cq_cutoff_summary FOR SELECT TO cq_public,cq_student USING (true);
REVOKE ALL ON public.cq_cutoff_summary FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.cq_cutoff_summary FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.cq_cutoff_summary FROM authenticated; END IF;
END $$;
GRANT SELECT ON public.cq_cutoff_summary TO cq_public,cq_student;
ANALYZE public.cq_cutoff_summary;
