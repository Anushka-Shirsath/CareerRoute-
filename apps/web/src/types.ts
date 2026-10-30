import type { components } from "../../../packages/api-client/schema";
export type PathwayId =
  | "fyjc_science"
  | "fyjc_commerce"
  | "fyjc_arts"
  | "polytechnic_diploma"
  | "iti_trade"
  | "vocational";
export type Locale = "en" | "mr" | "hi";
export type Subject = components["schemas"]["Subject"];
export type Preferences = components["schemas"]["Preferences"];
export type Academic = components["schemas"]["AcademicSummary"];
export type Compass = components["schemas"]["CompassReport"];
export type MatchResult = components["schemas"]["MatchOutput"];
export type Ranked = components["schemas"]["RankedOffering"];
export type Result = components["schemas"]["ResultView"];
export type Profile = {
  display_name?: string | null;
  locale: Locale;
  home_city: string | null;
  home_district: string | null;
  target_districts: string[];
  active_goal_pathway: PathwayId | null;
  is_synthetic: boolean;
  chat_history_enabled: boolean;
};
export type Source = {
  source_id: string;
  url: string;
  publisher?: string;
  academic_year?: string | null;
  supplied_at?: string;
  retrieved_at?: string | null;
  terms_checked?: string;
  notes?: string;
};
export type Fee = {
  kind: string;
  amount_inr: number | null;
  annualized_amount_inr?: number;
  academic_year: string;
  status: string;
  source_id: string | null;
  per?: string;
  assumption?: string;
};
export type Offering = components["schemas"]["OfferingFacts"] & {
  published_fee?: { amount: number; academic_year: string; source_url: string; note: string | null } | null;
  historical_hostel?: { boys_capacity: number | null; girls_capacity: number | null; data_status: string; source_url: string | null } | null;
  possible_cutoffs?: { academic_year: string; round: string; seat_type: string; stage: string; reservation: string | null; rank: number | null; merit_percent: number | null; choice_code: string; join_status: string; source_url: string | null }[];
  fees?: Fee[];
  cutoffs?: {
    id: string;
    academic_year: string;
    round: string;
    category?: string;
    quota?: string;
    numeric_value: number | null;
    raw_value: string;
    merit_metric: string;
    source_id: string;
  }[];
  sources?: Source[];
  warnings?: string[];
  program_code?: string;
  course_management_type?: string | null;
  approval_status?: string | null;
};
export type Shortlist = {
  id: string;
  offering_id: string;
  status: string;
  status_label: string;
  note?: string | null;
  facts: Offering | null;
};
export type Checklist = {
  id: string;
  pathway_id: PathwayId;
  label_key: string;
  done: boolean;
  verification_status: string;
};
export type Dashboard = {
  profile: Profile;
  academic_snapshot: Academic | null;
  compass_summary: {
    mode: string;
    coverage: string;
    routes: { pathway_id: PathwayId }[];
  } | null;
  shortlist: Shortlist[];
  next_steps: Checklist[];
};
export type Page<T> = { items: T[]; next_cursor: string | null };
export type Cost = {
  offering_id: string;
  institution_name: string;
  academic_year: string;
  lines: Fee[];
  verified_institutional_total: number;
  estimated_personal_total: number;
  estimated_total: number;
  unknown_lines: string[];
  total_label: string;
  warnings: string[];
  assumptions: Assumptions;
};
export type Assumptions = {
  months: number;
  hostel_monthly?: number | null;
  food_monthly?: number | null;
  transport_monthly?: number | null;
  travel_home_monthly?: number | null;
  books_supplies?: number | null;
};
export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  fallback?: boolean;
  sources?: string[];
  source_links?: string[];
  actions?: { label: string; href: string }[];
  memory_suggestions?: {
    suggestion_id: string;
    content: string;
    requires_confirmation: boolean;
  }[];
  pending_preference_change?: {
    proposal_id: string;
    field: string;
    value: unknown;
  } | null;
};
export type ReportSnapshot = {
  sections: Record<string, unknown>;
  locale_default: Locale;
  created_at: string;
  notice: string;
  labels?: Record<string, string>;
  locale?: Locale;
};
export type ParentReport = {
  report_id: string;
  share_url: string;
  expires_at: string;
  preview: ReportSnapshot;
};
export type Memory = {
  id: string;
  kind: string;
  content: string;
  origin: string;
};
export type GameNode = {
  id: string;
  type: "choice" | "multi_select" | "values" | "minitask" | "rating";
  text: string;
  options: { id: string; text: string; tags?: Record<string, number> }[];
  dimension?: string;
  task?: { text: string; choices?: string[]; hint: string };
};
export type GameSession = {
  session_id: string;
  ruleset: string;
  state: string;
  node: GameNode | null;
  done?: boolean;
  translation_status?: string;
};
export type Coverage = {
  districts: {
    district: string;
    poly_institutes: number | null;
    poly_offerings: number | null;
    iti_institutes: number | null;
    fyjc_colleges: number | null;
    fyjc_offerings: number | null;
    poly_cutoff_years: string[];
    fyjc_cutoff_years: string[];
    poly_fee_verified_pct: number | null;
    hostel_known_pct: number | null;
    layer: string;
    last_refreshed: string | null;
  }[];
  unknown_location_institutions: number;
  note: string;
};
export type Stats = {
  institutions: number;
  offerings: number;
  sources: number;
  historical_records: number;
  districts: number;
};
