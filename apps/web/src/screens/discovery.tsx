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
type MasterEvidence = {
  verified_cutoff_metrics: { academic_year: string; round_name: string; category: string; reservation_details: string | null; cutoff_value_raw: string; merit_metric: string; scale_max: number; source_url: string; source_label: string }[];
  addresses: { address: string; source_url: string | null; source_label: string }[];
  fee_guidance: { academic_year: string; applicable_management: string; tuition_inr: number; development_inr: number; other_inr: number; annual_total_inr: number; refundable_deposit_inr: number; scope_note: string; source_url: string; source_label: string }[];
  fee_order_history: { ffc_code: string; academic_year: string | null; total_inr: number | null; row_kind: string; q_status: string; image_verified: boolean; superseded_by: string | null; no_revision_carryover: boolean; ffc_source_url: string | null }[];
  reviews_and_hostel_notes: { entry_type: string; source: string; url: string; posted: string | null; rating: string | null; claim_or_text: string; status: string }[];
  allotment_history: { cap_round: number; allotted_seat_type: string; allotted_count: number; highest_state_merit_no: number | null; paired_merit_pct: number | null; metric_status: string; parse_status: string | null; source_url: string | null }[];
};
function MasterEvidencePanel({ id }: { id: string }) {
  const { data, loading, error } = useData<MasterEvidence | null>('/master/offerings/' + encodeURIComponent(id));
  if (loading) return <Panel className="span-12" title="Fees and admission evidence"><Loading lines={2} /></Panel>;
  if (error) return <Panel className="span-12" title="Fees and admission evidence"><p>Fee and allotment records could not be loaded. Please try again later.</p></Panel>;
  return <Panel className="span-12" title="Address, fees and admission evidence">
    <section className="master-evidence-section"><h3>Address</h3>
      {data?.addresses?.length ? data.addresses.map((a, i) => <div className="master-evidence-row" key={`${a.address}-${i}`}><div><strong>{a.address}</strong><p>{a.source_label}. Check the institute’s current address before visiting.</p></div>{a.source_url?.startsWith('https://') && <a href={a.source_url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</div>) : <p className="panel-note">A street address is not available in the supplied records. Contact the institute before visiting.</p>}
    </section>
    {!!data?.fee_guidance?.length && <section className="master-evidence-section"><h3>Government and aided fee schedule</h3>
      {data.fee_guidance.map((g) => <div className="master-evidence-row" key={g.academic_year}><div><strong>{money(g.annual_total_inr)} per year · {g.academic_year}</strong><p>General post-SSC schedule for {g.applicable_management}: tuition {money(g.tuition_inr)}, development {money(g.development_inr)}, other {money(g.other_inr)}. Refundable one-time deposit {money(g.refundable_deposit_inr)}.</p><p>{g.scope_note} This is general guidance; confirm that it applies to this course.</p><small>{g.source_label}</small></div><a href={g.source_url} target="_blank" rel="noopener noreferrer">View brochure ↗</a></div>)}
    </section>}
    {!data?.fee_order_history.length && <section className="master-evidence-section"><h3>Fee order history</h3><p className="panel-note">No reliably linked fee order was found for this college. Ask the institute for its current program fees; a missing amount is not zero.</p></section>}
    {!!data?.fee_order_history.length && <section className="master-evidence-section"><h3>Fee order history</h3><p className="panel-note">Showing up to 20 historical tuition and development totals for the linked institute unit, not a confirmed current fee for this program. Hostel and other costs are separate. Check the order and applicability with the institute.</p>
      {data.fee_order_history.map((f, i) => <div className="master-evidence-row" key={`${f.ffc_code}-${f.academic_year}-${i}`}><div><strong>{f.total_inr == null ? 'Amount not stated' : money(f.total_inr)}</strong><p>{f.academic_year || 'Year not stated'} · MSBTE unit {f.ffc_code} · {f.image_verified ? 'Checked against scan' : 'Not individually scan-verified'}{f.superseded_by ? ' · Superseded' : ''}{f.no_revision_carryover ? ' · Carried forward' : ''}</p></div>{f.ffc_source_url?.startsWith('https://') && <a href={f.ffc_source_url} target="_blank" rel="noopener noreferrer">View order ↗</a>}</div>)}
    </section>}
    {!!data?.verified_cutoff_metrics?.length && <section className="master-evidence-section"><h3>Verified cutoff scale</h3><p className="panel-note">The college’s notice identifies these specific figures as merit marks out of 500. A past cutoff is a historical reference, not a guarantee of admission; use the same round, category and reservation when checking it.</p>
      {data.verified_cutoff_metrics.map((v, i) => <div className="master-evidence-row" key={`${v.academic_year}-${v.round_name}-${v.category}-${v.reservation_details}-${i}`}><div><strong>{v.cutoff_value_raw} / {v.scale_max} merit marks</strong><p>{v.academic_year} · {v.round_name} · {v.category} · {v.reservation_details || 'Reservation not stated'}</p><small>{v.source_label}</small></div><a href={v.source_url} target="_blank" rel="noopener noreferrer">View college notice ↗</a></div>)}
    </section>}
    {!!data?.reviews_and_hostel_notes.length && <section className="master-evidence-section"><h3>Reviews and hostel notes</h3><p className="panel-note">These are dated, attributed reports and may be incomplete or contradictory. Confirm current hostel availability with the institute.</p>
      {data.reviews_and_hostel_notes.map((r, i) => <div className="master-evidence-row" key={`${r.source}-${i}`}><div><strong>{r.entry_type === 'review' ? 'Student review' : 'Hostel note'} · {r.source}</strong><p>{r.claim_or_text}</p><small>{r.posted || 'Date not stated'} · {pretty(r.status)}{r.rating ? ' · ' + r.rating : ''}</small></div>{r.url?.startsWith('https://') && <a href={r.url} target="_blank" rel="noopener noreferrer">View source ↗</a>}</div>)}
    </section>}
    {!!data?.allotment_history?.length && <section className="master-evidence-section"><h3>Historical Polytechnic allotments</h3><p className="panel-note">Showing up to 15 values derived from historical allotment lists. They are not official cutoffs, last-allottee ranks, or predictions. Incomplete parses and missing values do not prove availability.</p>
      {data.allotment_history.map((a, i) => <div className="master-evidence-row" key={`${a.cap_round}-${a.allotted_seat_type}-${i}`}><div><strong>Round {a.cap_round} · {a.allotted_seat_type}</strong><p>{a.allotted_count} allotments · Derived paired merit: {a.paired_merit_pct == null ? 'not available' : `${a.paired_merit_pct}%`} · Row: {pretty(a.metric_status)} · List: {pretty(a.parse_status || 'unknown')} · Check year in source</p></div>{a.source_url?.startsWith('https://') && <a href={a.source_url} target="_blank" rel="noopener noreferrer">View list ↗</a>}</div>)}
    </section>}
  </Panel>;
}
export function DirectoryPage() {
  const params = useSearchParams(),
    ws = useWorkspace(),
    task = useTask();
  const [search, setSearch] = useState(params.get("q") || ""),
    [term, setTerm] = useState(params.get("q") || ""),
    [district, setDistrict] = useState(""),
    [pathway, setPathway] = useState(params.get("pathway") || ""),
    [year, setYear] = useState(""),
    [management, setManagement] = useState(""),
    [items, setItems] = useState<Offering[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    setSearch(params.get("q") || "");
    setTerm(params.get("q") || "");
    setPathway(params.get("pathway") || "");
  }, [params]);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const request = query("/colleges", {
    q: term,
    district,
    pathway,
    academic_year: year,
    management,
    limit: 12,
  });
  const current = useRef(request);
  current.current = request;
  const { data, loading, error, reload } = useData<
    Page<Offering> & { total: number }
  >(request);
  useEffect(() => {
    if (data) {
      setItems(data.items);
      setCursor(data.next_cursor);
    }
  }, [data]);
  const more = () =>
    task.run(async () => {
      const original = request;
      const page = await api<Page<Offering>>(
        request + "&cursor=" + encodeURIComponent(cursor || ""),
      );
      if (current.current === original) {
        setItems((old) => [...old, ...page.items]);
        setCursor(page.next_cursor);
      }
    });
  return (
    <>
      <PageHeader
        title="A place for your possibilities"
        description="Browse published programs across Maharashtra. Every known detail has a source; every gap stays visible."
        action={
          <ActionLink href="/finder" variant="primary" icon="sliders">
            Personalise my search
          </ActionLink>
        }
      />
      <div className="filter-toolbar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search institution names"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by institution name"
            maxLength={100}
          />
        </label>
        <select
          aria-label="Filter by pathway"
          value={pathway}
          onChange={(e) => setPathway(e.target.value)}
        >
          <option value="">All pathways</option>
          <RouteOptions />
        </select>
        <select
          aria-label="Filter by district"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="">All districts</option>
          <DistrictOptions />
        </select>
        <select
          aria-label="Filter by academic year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All published years</option>
          <option>2026-27</option>
          <option>2025-26</option>
        </select>
        <select
          aria-label="Filter by management"
          value={management}
          onChange={(e) => setManagement(e.target.value)}
        >
          <option value="">All management types</option>
          <option value="government">Government</option>
          <option value="government_aided">Government aided</option>
          <option value="private_unaided">Private unaided</option>
        </select>
      </div>
      <div className="list-intro">
        <span>
          <strong>{data ? fmt(data.total) : "…"}</strong> published offerings
          {district ? " in " + district : ""}
        </span>
        <span>Programs, mediums and years are kept separate.</span>
      </div>
      {pathway === "polytechnic_diploma" && (
        <Notice icon="pin">
          District coverage varies by source. Browse all districts if a college
          is missing; its name is never used to guess its location.
        </Notice>
      )}
      {loading ? (
        <Loading lines={4} />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : items.length ? (
        <div className="college-list">
          {items.map((item) => (
            <CollegeRow key={item.id} offering={item} />
          ))}
        </div>
      ) : (
        <Panel className="section-gap">
          <Empty
            title="No offerings match these filters"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setDistrict("");
                  setPathway("");
                  setYear("");
                  setManagement("");
                }}
              >
                Clear filters
              </Button>
            }
          >
            Try another pathway or district. Missing location data can also keep
            a program out of a district search.
          </Empty>
        </Panel>
      )}
      {cursor && !loading && (
        <div className="actions section-gap">
          <Button variant="secondary" busy={task.busy} onClick={more}>
            Show more offerings
          </Button>
          <span className="muted text-small">
            Showing {fmt(items.length)} of {fmt(data?.total)}
          </span>
        </div>
      )}
      {task.error && <ErrorState message={task.error} />}
      <p className="panel-note">
        This is a directory, not a personal admission recommendation. Read{" "}
        <Link href="/data" className="text-link">
          our coverage notes
        </Link>{" "}
        before deciding.
      </p>
    </>
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
      <Notice>Admission chances are not available from the current data: the FYJC figures have an unverified unit, and the Polytechnic figures are derived from allotment lists rather than verified closing cutoffs. You can still explore colleges by location and preferences, then review the historical sources on each college page.</Notice>
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
    <>
      <PageHeader
        title="A closer look"
        description={route(o.pathway_id)?.name || o.pathway_id}
        action={
          <div className="actions">
            <Button
              variant={ws.isSaved(o.id) ? "secondary" : "primary"}
              busy={task.busy}
              icon={ws.isSaved(o.id) ? "check" : "bookmark"}
              onClick={() => task.run(() => ws.saveOffering(o))}
            >
              {ws.isSaved(o.id) ? "Saved to shortlist" : "Save to shortlist"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => ws.toggleCompare(o.id)}
              icon="scale"
            >
              {ws.compareIds.includes(o.id)
                ? "Remove from compare"
                : "Compare costs"}
            </Button>
          </div>
        }
      />
      <p className="offering-title">{o.name}</p>
      <div className="actions" style={{ marginBottom: 24 }}>
        <Tag>{o.program_name}</Tag>
        <span className="muted text-small">
          {o.academic_year || "Academic year not provided"}
        </span>
      </div>
      <div className="grid">
        <Panel className="span-8" title="What the sources tell us">
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
                <small>{o.academic_year || "Year unknown"}</small>
              </div>
            ))}
          </div>
          <p className="panel-note">
            A course management label is not an approval status. Approval status
            is not published in the checked DTE feed.
          </p>
        </Panel>
        <Panel className="span-4" title="Before you decide">
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
        </Panel>
        <MasterEvidencePanel id={id} />
        <Panel className="span-8" title="Published historical records">
          {(o.cutoffs || []).length > 0 ? (
            <>
              <Notice>
                Some published numbers have an unspecified metric. They must not
                be read as percentage cutoffs or compared to your
                entered-subject average.
              </Notice>
              <div className="filter-toolbar section-gap">
                <select
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
                </select>
                <select
                  aria-label="Historical record round"
                  value={round}
                  onChange={(e) => setRound(e.target.value)}
                >
                  <option value="">All rounds</option>
                  {[...new Set(o.cutoffs!.map((c) => c.round))].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
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
        </Panel>
        <Panel className="span-4" title="Follow the evidence">
          <div className="source-list">
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
        </Panel>
      </div>
      {task.error && <ErrorState message={task.error} />}
      <div className="actions section-gap">
        <ActionLink href="/colleges" variant="text" icon="back">
          Back to offerings
        </ActionLink>
      </div>
    </>
  );
}
