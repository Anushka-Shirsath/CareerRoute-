-- General fee guidance is source-scoped, not an institute-specific fee.
CREATE TABLE IF NOT EXISTS public.cq_fee_guidance (
  id text PRIMARY KEY,
  academic_year text NOT NULL,
  pathway text NOT NULL,
  applicable_management text NOT NULL,
  tuition_inr integer NOT NULL,
  development_inr integer NOT NULL,
  other_inr integer NOT NULL,
  annual_total_inr integer NOT NULL,
  refundable_deposit_inr integer NOT NULL,
  scope_note text NOT NULL,
  source_url text NOT NULL,
  source_label text NOT NULL
);
ALTER TABLE public.cq_fee_guidance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cq_fee_guidance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cq_fee_guidance_read ON public.cq_fee_guidance;
CREATE POLICY cq_fee_guidance_read ON public.cq_fee_guidance FOR SELECT TO cq_public, cq_student USING (true);
REVOKE ALL ON public.cq_fee_guidance FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.cq_fee_guidance FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.cq_fee_guidance FROM authenticated; END IF;
END $$;
GRANT SELECT ON public.cq_fee_guidance TO cq_public, cq_student;
INSERT INTO public.cq_fee_guidance VALUES (
 'dte-poly-post-ssc-govt-aided-2026-27','2026-27','polytechnic',
 'Government and non-government aided institutes',6000,1000,550,7550,200,
 'First year and direct second year post-SSC diploma. The self-financed Rubber Technology course at Government Polytechnic Mumbai is excluded. Concessions may apply; check program management and the official brochure. Hostel and mess are not included.',
 'https://poly26.dtemaharashtra.gov.in/poly_26/assets/pdf/Diploma%20Admission%20Information%20Brochure%202026-27.pdf',
 'DTE Maharashtra Diploma Admission Information Brochure 2026–27, section 17.1'
) ON CONFLICT (id) DO NOTHING;
