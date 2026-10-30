-- Independent source verification is an overlay; the master source remains unchanged.
CREATE TABLE IF NOT EXISTS public.cq_verified_cutoff_metrics (
  master_cutoff_id bigint PRIMARY KEY,
  merit_metric text NOT NULL,
  scale_max integer NOT NULL,
  source_url text NOT NULL,
  source_label text NOT NULL
);
ALTER TABLE public.cq_verified_cutoff_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cq_verified_cutoff_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cq_verified_cutoff_metrics_read ON public.cq_verified_cutoff_metrics;
CREATE POLICY cq_verified_cutoff_metrics_read ON public.cq_verified_cutoff_metrics FOR SELECT TO cq_public,cq_student USING (true);
REVOKE ALL ON public.cq_verified_cutoff_metrics FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.cq_verified_cutoff_metrics FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.cq_verified_cutoff_metrics FROM authenticated; END IF;
END $$;
GRANT SELECT ON public.cq_verified_cutoff_metrics TO cq_public,cq_student;
INSERT INTO public.cq_verified_cutoff_metrics (master_cutoff_id,merit_metric,scale_max,source_url,source_label)
SELECT a.id,'fyjc_merit_marks',500,
 'https://aavpc.ac.in/uploads/2026/06/FYJC%20CUT%20OFF%20OF%20CAP%20OPEN%20ROUND%202.pdf',
 'Smt. Gokalibai P. P. High School and Acharya A. V. Patel Junior College, 2026–27 Round 2 notice'
FROM cq_master_v11.admission_cutoffs a
JOIN cq_master_v11.institution_programs p ON p.id=a.institution_program_id
JOIN cq_master_v11.admission_cycles cy ON cy.cycle_id=a.cycle_id
JOIN (VALUES ('MU7094CNE','Remaining seats (Pure)','435'),('MU7094CNE','Women (30%)','442'),
 ('MU7094SGE','Remaining seats (Pure)','360'),('MU7094SGE','Women (30%)','365'),
 ('MU7094SNE','Remaining seats (Pure)','250'),('MU7094SNE','Women (30%)','260'))
 AS evidence(choice_code,reservation,cutoff) ON evidence.choice_code=p.choice_code
 AND evidence.reservation=a.reservation_details AND evidence.cutoff=a.cutoff_value_raw
WHERE p.institution_id=3792 AND cy.academic_year='2026-27' AND cy.round_name='Regular Round-2' AND upper(a.category)='GENERAL'
ON CONFLICT (master_cutoff_id) DO NOTHING;
