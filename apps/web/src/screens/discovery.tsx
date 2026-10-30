"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, write, query, numberOrNull } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import {
  criteriaLabels,
  cutoffLabels,
  districts,
  eligibilityLabels,
  fmt,
  money,
  pathways,
  pretty,
  reasonLabels,
  route,
} from "../content";
import {
  ActionLink,
  Button,
  CheckField,
  CollegeRow,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SourceLink,
  Tag,
  TextLink,
} from "../ui";
import type {
  MatchResult,
  Offering,
  Page,
  Preferences,
  Ranked,
} from "../types";

const defaultWeights: NonNullable<Preferences['weights']> = {academic_fit:85,affordability:75,proximity:50,government:40,hostel:25,medium:0};
const defaultPrefs: Preferences = {
  pathway: "polytechnic_diploma",
  target_districts: [],
  tuition_cap_inr: 30000,
  cap_is_hard: false,
  government: "preferred",
  hostel: "preferred",
  medium: null,
  medium_required: false,
  weights: {
    academic_fit: 85,
    affordability: 75,
    proximity: 50,
    government: 40,
    hostel: 25,
    medium: 0,
  },
};
function RouteOptions() {
  return (
    <>
      {pathways.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
}
function DistrictOptions() {
  return (
    <>
      {districts.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </>
  );
}
type CutoffOption = { academic_year: string; round: string; stage: string; seat_type: string };
type CutoffSuggestion = { offering_id: string; name: string; program_name: string; district: string | null; choice_code: string; cutoff_percent: number; difference: number; source_url: string; reservation: string | null; academic_year: string; round: string; stage: string; seat_type: string };
type CutoffSuggestions = { items: CutoffSuggestion[]; total: number; merit_percent: number; notice: string };

function CutoffExplorer() {
  const ws = useWorkspace(), task = useTask();
  const { data, loading, error, reload } = useData<{ available: boolean; options: CutoffOption[] }>("/cutoff-options");
  const [percentage, setPercentage] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [year, setYear] = useState(""), [round, setRound] = useState(""), [stage, setStage] = useState(""), [seat, setSeat] = useState("");
  const [suggestions, setSuggestions] = useState<CutoffSuggestions | null>(null);
  const academic = ws.dashboard?.academic_snapshot;
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !academic) return;
    initialized.current = true;
    const subjects = academic.subjects.filter(s => s.obtained != null && s.maximum === 100);
    if (academic.board === "SSC_MH" && subjects.length >= 5 && new Set(subjects.map(s => s.name_as_shown.toLowerCase())).size === subjects.length) {
      const best = subjects.map(s => s.obtained as number).sort((a, b) => b - a).slice(0, 5);
      setPercentage((best.reduce((a, b) => a + b, 0) / 5).toFixed(2));
    }
  }, [academic]);
  const options = data?.options || [];
  const years = [...new Set(options.map(o => o.academic_year))];
  const rounds = [...new Set(options.filter(o => o.academic_year === year).map(o => o.round))];
  const stages = [...new Set(options.filter(o => o.academic_year === year && o.round === round).map(o => o.stage))];
  const seats = [...new Set(options.filter(o => o.academic_year === year && o.round === round && o.stage === stage).map(o => o.seat_type))];
  useEffect(() => { setSuggestions(null); }, [percentage, year, round, stage, seat]);
  const compare = () => task.run(async () => {
    setSuggestions(await write<CutoffSuggestions>("/cutoff-recommendations", { merit_percent: Number(percentage), verified_by_student: confirmed, academic_year: year, round, stage, seat_type: seat }));
  });
  return <section className="cutoff-explorer" aria-labelledby="cutoff-explorer-title">
    <div className="cutoff-intro"><h2 id="cutoff-explorer-title">Explore by your marks</h2><p>Compare your confirmed result with published Polytechnic cutoffs from an earlier admission round.</p></div>
    {!academic ? <p>Confirm the marks read from your marksheet first. <Link href="/start">Review your marks</Link></p> : <>
      {loading && <Loading lines={2}/>}{error && <ErrorState message={error} retry={reload}/>}
      {data && !data.available && <Notice>Historical cutoff data is not available on this server.</Notice>}
      {data?.available && <>
        <fieldset className="cutoff-fields" disabled={task.busy}>
        <div className="cutoff-inputs">
          <Field label="Your merit percentage" hint="Check the aggregate on your marksheet or DTE application, including any applicable additional marks. The suggested figure is only an estimate from your entered subjects."><input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e => { setPercentage(e.target.value); setConfirmed(false); }} /></Field>
          <Field label="Historical year"><select value={year} onChange={e => {setYear(e.target.value); setRound(""); setStage(""); setSeat("");}}><option value="">Select year</option>{years.map(v => <option key={v}>{v}</option>)}</select></Field>
          <Field label="CAP round"><select value={round} onChange={e => {setRound(e.target.value); setStage(""); setSeat("");}} disabled={!year}><option value="">Select round</option>{rounds.map(v => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Stage"><select aria-label="Stage" value={stage} onChange={e => {setStage(e.target.value); setSeat("");}} disabled={!round}><option value="">Select stage</option>{stages.map(v => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Published seat type" hint="Choose the exact code that applies to you in the cutoff publication. Codes can depend on category, district, gender and other criteria."><select value={seat} onChange={e => setSeat(e.target.value)} disabled={!stage}><option value="">Select seat type</option>{seats.map(v => <option key={v}>{v}</option>)}</select></Field>
        </div>
        <CheckField label="I checked this percentage against my marksheet or DTE application" checked={confirmed} onChange={setConfirmed}/>
        </fieldset>
        <p className="panel-note">The course-code links have not been independently confirmed. Historical cutoffs change and do not guarantee admission. Check the source and current eligibility before applying.</p>
        <Button busy={task.busy} disabled={!confirmed || percentage === "" || Number(percentage) < 0 || Number(percentage) > 100 || !year || !round || !stage || !seat} onClick={compare}>Find historical matches</Button>
        {task.error && <ErrorState message={task.error}/>}
      </>}
    </>}
    {suggestions && <div className="cutoff-results" aria-live="polite"><h3>{fmt(suggestions.total)} courses to investigate</h3><p>Past cutoff at or below {suggestions.merit_percent}%. Showing up to 50, closest first. Check each course and seat type in the source.</p>{suggestions.items.length === 0 && <p>No matching historical records were found for these selections.</p>}{suggestions.items.map(item => <article className="cutoff-result" key={item.offering_id}><div><Link href={'/colleges/' + encodeURIComponent(item.offering_id)}><strong>{item.name}</strong></Link><p>{item.program_name} · {item.district || 'District not provided'}</p><small>{item.academic_year} · Round {item.round} · {item.stage} · {item.seat_type}{item.reservation ? ` · ${item.reservation}` : ''}</small></div><div><strong>{item.cutoff_percent}% past cutoff</strong><p>{item.difference === 0 ? "Same as your entry" : `${item.difference.toFixed(2)} percentage points below your entry`}</p><a href={item.source_url} target="_blank" rel="noopener noreferrer">View source ↗</a></div></article>)}</div>}
  </section>;
}
type MasterEvidence = {
  verified_cutoff_metrics: { academic_year: string; round_name: string; category: string; reservation_details: string | null; cutoff_value_raw: string; merit_metric: string; scale_max: number; source_url: string; source_label: string }[];
  addresses: { address: string; source_url: string | null; source_label: string }[];
  fee_guidance: { academic_year: string; applicable_management: string; tuition_inr: number; development_inr: number; other_inr: number; annual_total_inr: number; refundable_deposit_inr: number; scope_note: string; source_url: string; source_label: string }[];
  fee_order_history: { ffc_code: string; academic_year: string | null; total_inr: number | null; row_kind: string; q_status: string; image_verified: boolean; superseded_by: string | null; no_revision_carryover: boolean; ffc_source_url: string | null }[];
  reviews_and_hostel_notes: { entry_type: string; source: string; url: string; posted: string | null; rating: string | null; claim_or_text: string; status: string }[];
  allotment_history: { cap_round: number; allotted_seat_type: string; allotted_count: number; highest_state_merit_no: number | null; paired_merit_pct: number | null; metric_status: string; parse_status: string | null; source_url: string | null }[];
};
function MasterEvidencePanel({ id }: { id: string }) {
  const { data, loading, error, reload } = useData<MasterEvidence | null>('/master/offerings/' + encodeURIComponent(id));
  if (loading) return <Panel className="span-12" title="Fees and admission evidence"><Loading lines={2} /></Panel>;
  if (error) return <Panel className="span-12" title="Fees and admission evidence"><ErrorState message="Fee and admission evidence could not be loaded." retry={reload}/></Panel>;
  return <Panel className="span-12" title="Address & supporting evidence">
    <details className="master-evidence-section" open><summary>Address</summary>
      {data?.addresses?.length ? data.addresses.map((a, i) => <div className="master-evidence-row" key={`${a.address}-${i}`}><div><strong>{a.address}</strong><p>{a.source_label}. Check the institute’s current address before visiting.</p></div>{a.source_url?.startsWith('https://') && <a href={a.source_url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</div>) : <p className="panel-note">A street address is not available in the supplied records. Contact the institute before visiting.</p>}
    </details>
    {!!data?.fee_guidance?.length && <details className="master-evidence-section" open><summary>Government and aided fee schedule</summary>
      {data.fee_guidance.map((g) => <div className="master-evidence-row" key={g.academic_year}><div><strong>{money(g.annual_total_inr)} per year · {g.academic_year}</strong><p>General post-SSC schedule for {g.applicable_management}: tuition {money(g.tuition_inr)}, development {money(g.development_inr)}, other {money(g.other_inr)}. Refundable one-time deposit {money(g.refundable_deposit_inr)}.</p><p>{g.scope_note} This is general guidance; confirm that it applies to this course.</p><small>{g.source_label}</small></div><a href={g.source_url} target="_blank" rel="noopener noreferrer">View brochure ↗</a></div>)}
    </details>}
    {!data?.fee_order_history?.length && <details className="master-evidence-section"><summary>Fee order history: no linked records</summary><p className="panel-note">No reliably linked fee order was found for this college. Ask the institute for its current program fees; a missing amount is not zero.</p></details>}
    {!!data?.fee_order_history?.length && <details className="master-evidence-section"><summary>Fee order history</summary><p className="panel-note">Showing up to 20 historical tuition and development totals for the linked institute unit, not a confirmed current fee for this program. Hostel and other costs are separate. Check the order and applicability with the institute.</p>
      {data.fee_order_history.map((f, i) => <div className="master-evidence-row" key={`${f.ffc_code}-${f.academic_year}-${i}`}><div><strong>{f.total_inr == null ? 'Amount not stated' : money(f.total_inr)}</strong><p>{f.academic_year || 'Year not stated'} · MSBTE unit {f.ffc_code} · {f.image_verified ? 'Checked against scan' : 'Not individually scan-verified'}{f.superseded_by ? ' · Superseded' : ''}{f.no_revision_carryover ? ' · Carried forward' : ''}</p></div>{f.ffc_source_url?.startsWith('https://') && <a href={f.ffc_source_url} target="_blank" rel="noopener noreferrer">View order ↗</a>}</div>)}
    </details>}
    {!!data?.verified_cutoff_metrics?.length && <details className="master-evidence-section"><summary>Verified cutoff scale</summary><p className="panel-note">The college’s notice identifies these specific figures as merit marks out of 500. A past cutoff is a historical reference, not a guarantee of admission; use the same round, category and reservation when checking it.</p>
      {data.verified_cutoff_metrics.map((v, i) => <div className="master-evidence-row" key={`${v.academic_year}-${v.round_name}-${v.category}-${v.reservation_details}-${i}`}><div><strong>{v.cutoff_value_raw} / {v.scale_max} merit marks</strong><p>{v.academic_year} · {v.round_name} · {v.category} · {v.reservation_details || 'Reservation not stated'}</p><small>{v.source_label}</small></div><a href={v.source_url} target="_blank" rel="noopener noreferrer">View college notice ↗</a></div>)}
    </details>}
    {!!data?.reviews_and_hostel_notes?.length && <details className="master-evidence-section"><summary>Reviews and hostel notes</summary><p className="panel-note">These are dated, attributed reports and may be incomplete or contradictory. Confirm current hostel availability with the institute.</p>
      {data.reviews_and_hostel_notes.map((r, i) => <div className="master-evidence-row" key={`${r.source}-${i}`}><div><strong>{r.entry_type === 'review' ? 'Student review' : 'Hostel note'} · {r.source}</strong><p>{r.claim_or_text}</p><small>{r.posted || 'Date not stated'} · {pretty(r.status)}{r.rating ? ' · ' + r.rating : ''}</small></div>{r.url?.startsWith('https://') && <a href={r.url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</div>)}
    </details>}
    {!!data?.allotment_history?.length && <details className="master-evidence-section"><summary>Historical Polytechnic allotments</summary><p className="panel-note">Showing up to 15 values derived from historical allotment lists. They are not official cutoffs, last-allottee ranks, or predictions. Incomplete parses and missing values do not prove availability.</p>
      {data.allotment_history.map((a, i) => <div className="master-evidence-row" key={`${a.cap_round}-${a.allotted_seat_type}-${i}`}><div><strong>Round {a.cap_round} · {a.allotted_seat_type}</strong><p>{a.allotted_count} allotments · Derived paired merit: {a.paired_merit_pct == null ? 'not available' : `${a.paired_merit_pct}%`} · Row: {pretty(a.metric_status)} · List: {pretty(a.parse_status || 'unknown')} · Check year in source</p></div>{a.source_url?.startsWith('https://') && <a href={a.source_url} target="_blank" rel="noopener noreferrer">View list ↗</a>}</div>)}
    </details>}
  </Panel>;
}
export function DirectoryPage() {
  const params = useSearchParams(), task = useTask();
  const [search, setSearch] = useState(params.get("q") || "");
  const [feeInput, setFeeInput] = useState(params.get("max_annual_fee") || "");
  const [filters, setFilters] = useState(() => ({
    q: params.get("q") || "", district: params.get("district") || "",
    pathway: params.get("pathway") || "", academic_year: params.get("academic_year") || "",
    management: params.get("management") || "", max_annual_fee: params.get("max_annual_fee") || "",
  }));
  const [items, setItems] = useState<Offering[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    const next = { q: params.get("q") || "", district: params.get("district") || "",
      pathway: params.get("pathway") || "", academic_year: params.get("academic_year") || "",
      management: params.get("management") || "", max_annual_fee: params.get("max_annual_fee") || "" };
    setFilters(next); setSearch(next.q); setFeeInput(next.max_annual_fee);
  }, [params]);
  const update = (changes: Partial<typeof filters>) => {
    const next = { ...filters, q: search.trim(), ...changes };
    setFilters(next);
    const url = new URL(window.location.href);
    Object.entries(next).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => update({ q: search.trim() }), 400);
    return () => clearTimeout(timer);
  }, [search, filters]);
  useEffect(() => {
    if (feeInput === filters.max_annual_fee || (feeInput && (!/^\d+$/.test(feeInput) || Number(feeInput) > 100000000))) return;
    const timer = setTimeout(() => update({ max_annual_fee: feeInput }), 400);
    return () => clearTimeout(timer);
  }, [feeInput, filters]);
  const reset = () => { setSearch(""); setFeeInput(""); update({q:"", district:"", pathway:"", academic_year:"", management:"", max_annual_fee:""}); };
  const request = query("/colleges", { ...filters, limit: 12 });
  const current = useRef(request); current.current = request;
  useEffect(() => { try { sessionStorage.setItem("cq_directory_url", window.location.pathname + window.location.search); } catch {} }, [request]);
  const { data, loading, error, reload } = useData<Page<Offering> & { total: number; fee_filter_available?: boolean }>(request);
  useEffect(() => { if (data) { setItems(data.items); setCursor(data.next_cursor); } }, [data]);
  const more = () => task.run(async () => {
    const original = request;
    const page = await api<Page<Offering>>(request + "&cursor=" + encodeURIComponent(cursor || ""));
    if (current.current === original) { setItems(old => [...old, ...page.items]); setCursor(page.next_cursor); }
  });
  const active = Object.entries(filters).filter(([,value]) => value);
  const filterNames: Record<string,string> = {q:"Name",district:"District",pathway:"Pathway",academic_year:"Year",management:"Management",max_annual_fee:"Annual fee"};
  const filterValue = (key: string, value: string) => key === "pathway" ? route(value)?.name || value : key === "management" ? pretty(value) : key === "max_annual_fee" ? `Up to ${money(Number(value))}` : value;
  return (
    <div className="college-search-page">
      <header className="college-search-heading">
        <div><h1>Find your next place.</h1><p>Explore colleges and courses across Maharashtra.</p></div>
        <Link href="/finder" className="search-personalise">Search with my preferences <Icon name="sliders" size={17}/></Link>
      </header>
      <section className="college-search-controls" aria-label="Search and filter colleges">
        <label className="college-name-search">
          <Icon name="search" size={23}/>
          <span className="sr-only">Search institution names</span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Which college are you looking for?" maxLength={100}/>
        </label>
        <p className="search-input-help">Search by college name, or use the filters to explore.</p>
        <div className="college-filter-grid">
          <label>Study pathway<select aria-label="Study pathway" value={filters.pathway} onChange={e => update({pathway:e.target.value})}><option value="">All pathways</option><RouteOptions/></select></label>
          <label>District<select aria-label="District" value={filters.district} onChange={e => update({district:e.target.value})}><option value="">Anywhere in Maharashtra</option><DistrictOptions/></select></label>
          <label>Academic year<select aria-label="Academic year" value={filters.academic_year} onChange={e => update({academic_year:e.target.value})}><option value="">All published years</option><option>2026-27</option><option>2025-26</option></select></label>
          <label>Management<select aria-label="Management" value={filters.management} onChange={e => update({management:e.target.value})}><option value="">All management types</option><option value="government">Government</option><option value="government_aided">Government aided</option><option value="private_unaided">Private unaided</option></select></label>
          <label>Maximum annual fee (₹)<input type="number" min="0" max="100000000" step="1" inputMode="numeric" aria-label="Maximum annual fee" placeholder="Any reported fee" value={feeInput} onChange={e => setFeeInput(e.target.value)}/></label>
        </div>
        {filters.max_annual_fee && <p className="search-input-help">Only courses with a sourced fee in the supplied records are shown. Fees are dated and may not include every cost.</p>}
        {data?.fee_filter_available === false && <p className="search-input-help">Fee search is unavailable until the supplied catalogue is installed on this server.</p>}
        {active.length > 0 && <div className="college-active-filters" aria-label="Active filters">
          <span>Searching with</span>
          {active.map(([key,value]) => <button key={key} onClick={() => {if(key === "q") setSearch(""); if(key === "max_annual_fee") setFeeInput(""); update({[key]:""});}} aria-label={`Remove ${filterNames[key]} filter: ${filterValue(key,value)}`}><span>{filterValue(key,value)}</span><Icon name="close" size={14}/></button>)}
          <button className="search-reset" onClick={reset}>Clear all</button>
        </div>}
      </section>
      <div className="college-search-results-head">
        <div role="status" aria-live="polite"><h2>{loading || search.trim() !== filters.q ? "Finding courses…" : error ? "Results unavailable" : `${fmt(data?.total || 0)} course offerings`}</h2><p>Each course, medium and year is listed separately.</p></div>
        <Link href="/shortlist" className="search-shortlist">My shortlist <Icon name="bookmark" size={16}/></Link>
      </div>
      {filters.pathway === "polytechnic_diploma" && <Notice icon="pin">District coverage varies by source. Try all districts if a college is missing.</Notice>}
      <div className="college-search-results" aria-busy={loading}>
        {loading ? <Loading lines={4}/> : error ? <ErrorState message={error} retry={reload}/> : items.length ? <div className="college-list">{items.map(item => <CollegeRow key={item.id} offering={item}/>)}</div> : <div className="college-search-empty"><Icon name="search" size={30}/><h2>No courses found this time.</h2><p>Try a shorter college name or remove a filter. Colleges without a verified district may only appear when searching all districts.</p><Button onClick={reset}>Clear filters and explore</Button></div>}
      </div>
      {cursor && !loading && !error && <div className="college-search-pagination"><span>Showing {fmt(items.length)} of {fmt(data?.total)} offerings</span><Button variant="secondary" busy={task.busy} onClick={more}>Show more offerings</Button></div>}
      {task.error && <ErrorState message={task.error}/>}
      <p className="college-search-footnote">A place to explore, not an admission prediction. Fees and hostel details are marked when unverified. <Link href="/data">Read about our data</Link></p>
    </div>
  );
}

export function FinderPage() {
  const ws = useWorkspace(),
    task = useTask();
  const prefData = useData<Preferences>("/me/preferences"),
    sensitive = useData<{ category_code: string | null }>("/me/sensitive");
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs),
    [year, setYear] = useState("2026-27"),
    [round, setRound] = useState(""),
    [quota, setQuota] = useState(""),
    [metric, setMetric] = useState(""),
    [category, setCategory] = useState(""),
    [result, setResult] = useState<MatchResult | null>(null),
    [collapsed, setCollapsed] = useState(true),
    [searching, setSearching] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (sensitive.data) setCategory(sensitive.data.category_code || "");
  }, [sensitive.data]);
  const context = (preference: Preferences) =>
    year
      ? {
          admission_system: (preference.pathway || "").startsWith("fyjc")
            ? "FYJC_CAP"
            : preference.pathway === "iti_trade"
              ? "DVET_ITI"
              : "DTE_POLY_CAP",
          academic_year: year,
          round: round || null,
          quota: quota || null,
          merit_metric: metric || null,
          extra_dimensions: {},
        }
      : null;
  const search = async (value: Preferences, save = false, cursor?: string) => {
    setSearching(true);
    task.setError("");
    try {
      if (save) {
        await write("/me/preferences", value, "PUT");
        await write(
          "/me/sensitive",
          { category_code: category.trim() || null },
          "PUT",
        );
      }
      const found = await write<MatchResult>("/match", {
        preferences: value,
        admission_context: context(value),
        limit: 10,
        cursor: cursor || null,
      });
      setResult((old) =>
        cursor && old
          ? {
              ...found,
              results: [...old.results, ...found.results],
              groups: Object.fromEntries(
                Object.entries(found.groups).map(([k, v]) => [
                  k,
                  [...(old.groups[k] || []), ...v],
                ]),
              ),
            }
          : found,
      );
      if (save) {
        await ws.refresh();
        ws.notify("Your search preferences are saved.");
      }
      setCollapsed(true);
    } catch (e) {
      task.setError(
        e instanceof Error ? e.message : "Search could not be completed.",
      );
    } finally {
      setSearching(false);
    }
  };
  useEffect(() => {
    if (prefData.data && !initialized.current) {
      initialized.current = true;
      setPrefs(prefData.data);
      search(prefData.data);
    }
  }, [prefData.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Preferences>(field: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [field]: value }));
  const statewide = () => {
    const next = { ...prefs, target_districts: [] };
    setPrefs(next);
    search(next);
  };
  return (
    <>
      <PageHeader
        title="Find your kind of place"
        description="Start with your practical needs. Eligibility, historical records and your preferences stay separate."
        action={
          <ActionLink href="/colleges" variant="text">
            Browse the directory
          </ActionLink>
        }
      />
      <CutoffExplorer />
      <div className="grid finder-grid">
        <Panel
          className={
            "span-4 filter-panel " + (collapsed ? "mobile-collapsed" : "")
          }
          title="Your preferences"
          action={
            <button
              className="text-link mobile-filter-toggle"
              style={{ display: "none" }}
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
            >
              Filters <Icon name="sliders" size={15} />
            </button>
          }
        >
          <div className="filter-fields">
            <Field label="Route">
              <select
                value={prefs.pathway || ""}
                onChange={(e) =>
                  set(
                    "pathway",
                    (e.target.value || null) as Preferences["pathway"],
                  )
                }
              >
                <option value="">All routes</option>
                <RouteOptions />
              </select>
            </Field>
            <Field label="Target district">
              <select
                value={prefs.target_districts?.[0] || ""}
                onChange={(e) =>
                  set(
                    "target_districts",
                    e.target.value ? [e.target.value] : [],
                  )
                }
              >
                <option value="">All districts</option>
                <DistrictOptions />
              </select>
            </Field>
            <Field label="Academic year">
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">All published years</option>
                <option>2026-27</option>
                <option>2025-26</option>
              </select>
            </Field>
            <Field label="Tuition budget / year">
              <input
                type="number"
                min={0}
                max={500000}
                value={prefs.tuition_cap_inr ?? ""}
                onChange={(e) =>
                  set("tuition_cap_inr", numberOrNull(e.target.value))
                }
              />
            </Field>
            <Field label="Management">
              <select
                value={prefs.government}
                onChange={(e) =>
                  set("government", e.target.value as Preferences["government"])
                }
              >
                <option value="any">Any management</option>
                <option value="preferred">Government preferred</option>
                <option value="only">Only government / aided</option>
              </select>
            </Field>
            <Field label="Hostel">
              <select
                value={prefs.hostel}
                onChange={(e) =>
                  set("hostel", e.target.value as Preferences["hostel"])
                }
              >
                <option value="any">Any / no preference</option>
                <option value="preferred">Hostel preferred</option>
                <option value="required">Hostel required</option>
              </select>
            </Field>
            <Field label="Preferred medium">
              <select
                value={prefs.medium || ""}
                onChange={(e) => set("medium", e.target.value || null)}
              >
                <option value="">No preference</option>
                <option>English</option>
                <option>Marathi</option>
                <option>Hindi</option>
                <option>Marathi - English</option>
              </select>
            </Field>
          </div>
          <div className="filter-extra">
            <CheckField
              label="Keep verified tuition under my budget"
              description="Unknown fees appear in a separate group."
              checked={Boolean(prefs.cap_is_hard)}
              onChange={(v) => set("cap_is_hard", v)}
            />
            <CheckField
              label="Require this medium"
              checked={Boolean(prefs.medium_required)}
              onChange={(v) => set("medium_required", v)}
              disabled={!prefs.medium}
            />
          </div>
          <details className="filter-disclosure" open>
            <summary>
              What matters most <Icon name="down" size={15} />
            </summary>
            <div className="weights">
              {Object.entries({
                ...defaultWeights,
                ...prefs.weights,
              }).map(([key, value]) => (
                <div className="weight-row" key={key}>
                  <div>
                    <label htmlFor={"weight-" + key}>
                      {criteriaLabels[key]}
                    </label>
                    <span className="num">{value}</span>
                  </div>
                  <input
                    id={"weight-" + key}
                    aria-label={`${criteriaLabels[key]} importance`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={value}
                    onChange={(e) =>
                      set("weights", {
                        ...defaultWeights,
                        ...prefs.weights,
                        [key]: Number(e.target.value),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <p className="panel-note">
              Importance values, not admission chances. Unmeasured criteria
              don’t contribute to a score.
            </p>
          </details>
          <details className="filter-disclosure">
            <summary>
              Optional historical comparison <Icon name="down" size={15} />
            </summary>
            <p className="panel-note">
              Published records differ by category, quota and round. This
              optional category is private and is never sent to the mentor.
            </p>
            <Field
              label="Category code"
              hint="Leave blank if you prefer not to say. Use the code in the publication."
            >
              <input
                value={category}
                maxLength={80}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Code as published"
                autoComplete="off"
              />
            </Field>
            <Field label="Admission round">
              <input
                value={round}
                maxLength={80}
                onChange={(e) => setRound(e.target.value)}
                placeholder="Round as published"
              />
            </Field>
            <Field label="Quota">
              <input
                value={quota}
                maxLength={80}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="Quota as published"
              />
            </Field>
            <Field label="Merit metric">
              <input
                value={metric}
                maxLength={80}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="Only a verified metric"
              />
            </Field>
          </details>
          <Button
            busy={searching}
            icon="search"
            onClick={() => search(prefs, true)}
          >
            Save & find offerings
          </Button>
        </Panel>
        <div className="span-8">
          {!ws.dashboard?.academic_snapshot && (
            <Notice icon="file">
              Your marks are still a draft. You can explore programs, but
              personal academic comparisons need a confirmed result.{" "}
              <Link href="/start/review" className="text-link">
                Review marks
              </Link>
            </Notice>
          )}
          {prefData.error && (
            <ErrorState message={prefData.error} retry={prefData.reload} />
          )}
          <div className="list-intro">
            <span>
              <strong>{result ? fmt(result.total) : "…"}</strong> offerings in
              this search
            </span>
            <span>Preference rank · v1</span>
          </div>
          {searching && !result ? (
            <Loading lines={4} />
          ) : result && result.results.length > 0 ? (
            <>
              {(["main", "hostel_unknown", "fee_unknown"] as const).map(
                (group) => {
                  const rows = result.groups[group] || [];
                  return rows.length > 0 ? (
                    <section key={group}>
                      <div className="results-group-heading">
                        <h2>
                          {group === "main"
                            ? "Matching your known preferences"
                            : group === "hostel_unknown"
                              ? "Hostel not verified"
                              : "Fee not verified"}
                        </h2>
                        <span className="muted text-small">
                          {rows.length} shown
                        </span>
                      </div>
                      {rows.map((row) => (
                        <div key={row.offering_id}>
                          <CollegeRow
                            offering={row.facts as Offering}
                            match={row}
                          />
                          <details
                            className="filter-disclosure"
                            style={{ marginTop: 12, paddingTop: 0, border: 0 }}
                          >
                            <summary>
                              Why this order? <Icon name="down" size={15} />
                            </summary>
                            <div className="match-explanation section-gap">
                              <h3>
                                {eligibilityLabels[row.eligibility_status]}
                              </h3>
                              <p className="muted text-small">
                                {cutoffLabels[row.cutoff_comparison.status]}
                                {row.cutoff_comparison.reason
                                  ? ": " +
                                    reasonLabels[row.cutoff_comparison.reason]
                                  : "."}
                              </p>
                              <div className="component-row">
                                <span>Preference criterion</span>
                                <span>Importance</span>
                                <span>Measured</span>
                              </div>
                              {row.components.map((c) => (
                                <div
                                  key={c.criterion}
                                  className="component-row"
                                >
                                  <span>
                                    {criteriaLabels[c.criterion] || c.criterion}
                                  </span>
                                  <span>{c.weight}</span>
                                  <span>
                                    {c.value == null
                                      ? "Not verified"
                                      : `${Math.round(c.value * 100)} / 100`}
                                  </span>
                                </div>
                              ))}
                              <p className="panel-note">
                                Evidence coverage:{" "}
                                {Math.round(row.evidence_coverage * 100)}% of
                                your selected importance has measured data. This
                                measures evidence, not admission probability.
                              </p>
                              <SourceLink id={row.facts.source_id} />
                            </div>
                          </details>
                        </div>
                      ))}
                    </section>
                  ) : null;
                },
              )}
              {result.next_cursor && (
                <Button
                  className="section-gap"
                  variant="secondary"
                  busy={searching}
                  onClick={() =>
                    search(prefs, false, result.next_cursor || undefined)
                  }
                >
                  Show more matches
                </Button>
              )}
            </>
          ) : result ? (
            <Panel>
              <Empty
                title="No verified match for these filters"
                action={
                  <div className="actions">
                    <Button
                      variant="secondary"
                      onClick={statewide}
                      busy={searching}
                    >
                      Search all districts
                    </Button>
                    <ActionLink href="/colleges" variant="text">
                      Browse the directory
                    </ActionLink>
                  </div>
                }
              >
                Missing district, fee or hostel information can limit a search.
                Try fewer hard filters or another route.
              </Empty>
              {(result.warnings as string[] | undefined)?.map((warning, i) => (
                <p className="panel-note" key={i}>
                  {warning}
                </p>
              ))}
            </Panel>
          ) : (
            <Loading lines={3} />
          )}{" "}
          {task.error && <ErrorState message={task.error} />}
          <p className="panel-note">
            Past closing records do not predict future admission. Eligibility
            still needs the current official rules.
          </p>
        </div>
      </div>
    </>
  );
}

export function OfferingPage({ id }: { id: string }) {
  const ws = useWorkspace(),
    task = useTask();
  const {
    data: o,
    loading,
    error,
    reload,
  } = useData<Offering>("/offerings/" + encodeURIComponent(id));
  const [year, setYear] = useState(""),
    [round, setRound] = useState("");
  const [polyRound, setPolyRound] = useState(""), [polySeat, setPolySeat] = useState("");
  const [backUrl, setBackUrl] = useState("/colleges");
  useEffect(() => {
    try { const saved = sessionStorage.getItem("cq_directory_url"); if (saved && /^\/colleges(?:\?|$)/.test(saved)) setBackUrl(saved); } catch {}
    setYear(""); setRound(""); setPolyRound(""); setPolySeat("");
  }, [id]);
  if (loading)
    return (
      <>
        <PageHeader title="College details" />
        <Loading lines={5} />
      </>
    );
  if (error || !o)
    return (
      <>
        <PageHeader title="College details" />
        <ErrorState message={error || "Offering not found."} retry={reload} />
        <ActionLink href="/colleges">Back to the directory</ActionLink>
      </>
    );
  const records = (o.cutoffs || []).filter(
    (c) => (!year || c.academic_year === year) && (!round || c.round === round),
  );
  return (
    <div className="college-detail-page">
      <Link href={backUrl} className="detail-back"><Icon name="back" size={16}/> Back to search results</Link>
      <header className="course-dossier">
        <div className="course-dossier-title"><h1>{o.name}</h1><p>{o.program_name}</p></div>
        <div className="course-dossier-meta">
          <span><Icon name="pin" size={16}/>{o.district || "District not provided"}</span>
          <span>{route(o.pathway_id)?.name || o.pathway_id}</span>
          <span>Published year: {o.academic_year || "Not provided"}</span>
        </div>
        <div className="course-dossier-actions">
          <Button busy={task.busy} icon={ws.isSaved(o.id) ? "check" : "bookmark"} onClick={() => task.run(() => ws.saveOffering(o))}>{ws.isSaved(o.id) ? "Saved to shortlist" : "Save to shortlist"}</Button>
          <button className="detail-compare" aria-pressed={ws.compareIds.includes(o.id)} onClick={() => ws.toggleCompare(o.id)}><Icon name="scale" size={18}/>{ws.compareIds.includes(o.id) ? "Remove from compare" : "Compare this course"}</button>
          <Link href="/shortlist" className="detail-shortlist">View my shortlist <Icon name="up" size={15}/></Link>
        </div>
        {task.error && <ErrorState message={task.error}/>}
      </header>
      <nav className="detail-section-nav" aria-label="On this course page">
        <Link href="#course-overview">Course overview</Link><Link href="#course-evidence">Address & evidence</Link><Link href="#course-history">Admission history</Link><Link href="#course-sources">Sources</Link>
      </nav>
      <div className="detail-layout">

        <section id="course-overview" className="detail-overview"><Panel title="The course at a glance">
          <p className="detail-section-intro">Source-reported details for {o.academic_year || "the published year"}. Unverified details need confirmation with the college.</p>
          <div className="facts-grid">
            {[
              { label: "Program", value: o.program_name },
              { label: "District", value: o.district || "Not provided" },
              { label: "Medium", value: o.medium || "Not verified" },
              {
                label: "Sanctioned intake",
                value: o.intake == null ? "Not verified" : fmt(o.intake),
              },
              {
                label: "Institution management",
                value: pretty(o.management || "unknown"),
              },
              {
                label: "Course management",
                value: o.course_management_type || "Not provided",
              },
              {
                label: "Hostel",
                value:
                  o.hostel_status === "available"
                    ? "Available"
                    : o.hostel_status === "not_available"
                      ? "Not available"
                      : "Not verified",
              },
              { label: "Tuition / year", value: money(o.tuition) },
            ].map((f) => (
              <div className="fact-pair" key={f.label}>
                <span>{f.label}</span>
                <strong>{f.value}</strong>

              </div>
            ))}
          </div>
          <p className="panel-note">
            A course management label is not an approval status. Approval status
            is not published in the checked DTE feed.
          </p>
          {o.published_fee && <div className="readiness-row"><strong>Published annual fee: {money(o.published_fee.amount)} · {o.published_fee.academic_year}</strong><p>The source reports an institute-wide diploma fee. Confirm the amount and its applicability to this course with the institute.</p>{o.published_fee.source_url.startsWith("https://") && <a href={o.published_fee.source_url} target="_blank" rel="noopener noreferrer">View fee order ↗</a>}</div>}
          {o.historical_hostel && <div className="readiness-row"><strong>Historical hostel declaration · 2025–26</strong><p>Declared capacity: boys {o.historical_hostel.boys_capacity ?? "not stated"}; girls {o.historical_hostel.girls_capacity ?? "not stated"}. Current availability is not verified.</p>{o.historical_hostel.source_url?.startsWith("https://") && <a href={o.historical_hostel.source_url} target="_blank" rel="noopener noreferrer">View declaration ↗</a>}</div>}
        </Panel></section>
        <aside className="detail-next-steps"><Panel title="Before you apply">
          <div className="readiness-row">
            <strong>Eligibility needs official rules</strong>
            <p>No admission guarantee is inferred from a directory entry.</p>
          </div>
          <div className="readiness-row">
            <strong>Costs still need checking</strong>
            <p>Missing tuition or hostel fees are unknown, never zero.</p>
          </div>
          <div className="readiness-row">
            <strong>Past is not a prediction</strong>
            <p>
              A numeric record is only comparable when its full admission
              context and metric match.
            </p>
          </div>
          <ActionLink href={"/explore/" + o.pathway_id} className="section-gap">
            Admission guide
          </ActionLink>
        </Panel></aside>
        <section id="course-evidence" className="detail-evidence"><MasterEvidencePanel id={id} /></section>
        <section id="course-history" className="detail-history"><Panel title="Admission history">
          {!!o.possible_cutoffs?.length && <details className="master-evidence-section"><summary>Historical Polytechnic cutoff records</summary><p className="panel-note">These records share this course’s choice code, but the source did not confirm the link. Check the year, round and seat type in the source; a past cutoff does not guarantee admission.</p><div className="detail-history-filters"><label>Round<select aria-label="Polytechnic cutoff round" value={polyRound} onChange={e => setPolyRound(e.target.value)}><option value="">All rounds</option>{[...new Set(o.possible_cutoffs.map(c => c.round))].map(r => <option key={r}>{r}</option>)}</select></label><label>Seat type<select aria-label="Polytechnic cutoff seat type" value={polySeat} onChange={e => setPolySeat(e.target.value)}><option value="">All seat types</option>{[...new Set(o.possible_cutoffs.map(c => c.seat_type))].sort().map(s => <option key={s}>{s}</option>)}</select></label></div>{o.possible_cutoffs.filter(c => (!polyRound || c.round === polyRound) && (!polySeat || c.seat_type === polySeat)).map((c, i) => <div className="master-evidence-row" key={`${c.choice_code}-${c.round}-${c.seat_type}-${c.stage}-${i}`}><div><strong>{c.merit_percent == null ? "Percentage not stated" : `${c.merit_percent}%`} {c.rank == null ? "" : `· Rank ${fmt(c.rank)}`}</strong><p>{c.academic_year} · Round {c.round} · {c.seat_type} · {c.stage}</p><small>{c.reservation || "Reservation context not stated"}</small></div>{c.source_url?.startsWith("https://") && <a href={c.source_url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</div>)}</details>}
          {(o.cutoffs || []).length > 0 ? (
            <>
              <Notice>
                Some published numbers have an unspecified metric. They must not
                be read as percentage cutoffs or compared to your
                entered-subject average.
              </Notice>
              <div className="detail-history-filters">
                <label>Published year<select
                  aria-label="Historical record year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option value="">All years</option>
                  {[...new Set(o.cutoffs!.map((c) => c.academic_year))]
                    .sort()
                    .reverse()
                    .map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                </select></label>
                <label>Admission round<select
                  aria-label="Historical record round"
                  value={round}
                  onChange={(e) => setRound(e.target.value)}
                >
                  <option value="">All rounds</option>
                  {[...new Set(o.cutoffs!.map((c) => c.round))].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select></label>
              </div>
              {records.length === 0 && <div className="detail-no-history"><p>No historical records match this year and round.</p><Button variant="text" onClick={() => {setYear("");setRound("");}}>Show all historical records</Button></div>}
              <p className="detail-table-hint">Scroll across the table to see every column.</p>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Historical source records">
                <table className="historic-table">
                  <thead>
                    <tr>
                      <th>Year / round</th>
                      <th>Category / quota</th>
                      <th className="num">Published value</th>
                      <th>Metric</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 20).map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.academic_year}
                          <small className="muted" style={{ display: "block" }}>
                            {c.round}
                          </small>
                        </td>
                        <td>
                          {c.category || "Not provided"}
                          <small className="muted" style={{ display: "block" }}>
                            {c.quota || "Quota not stated"}
                          </small>
                        </td>
                        <td className="num">{c.raw_value || "—"}</td>
                        <td>
                          {c.merit_metric === "not_stated_by_source"
                            ? "Not stated by source"
                            : c.merit_metric || "Not verified"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="panel-note">
                Showing {Math.min(20, records.length)} of {records.length}{" "}
                records for these filters. Use the source for the complete
                publication.
              </p>
            </>
          ) : (
            <p className="muted">
              No published institute-level cutoff record is available for this
              offering in our dataset.
            </p>
          )}
        </Panel></section>
        <section id="course-sources" className="detail-sources"><Panel title="Check the original sources">
          <p className="detail-section-intro">Open the publication to check its date, course and admission context.</p>
          <div className="source-list">
            {!o.sources?.length && <p>No original source link is available for this course. Confirm the details directly with the college.</p>}
            {o.sources?.map((source) => (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                key={source.source_id}
              >
                <span>
                  {source.publisher || "Published source"}
                  <small>{o.academic_year || "Year not provided"}</small>
                </span>
                <Icon name="external" size={15} />
              </a>
            ))}
          </div>
          <p className="panel-note">
            Source metadata is inherited from the supplied database and reviewed
            extract. Redistribution terms may still need checking.
          </p>
        </Panel></section>
      </div>
      <div className="detail-bottom"><Link href={backUrl}>Back to search results</Link><Link href="#course-overview">Return to course overview</Link></div>
    </div>
  );
}
