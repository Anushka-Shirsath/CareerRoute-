"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, write, numberOrNull } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import { costLabels, fmt, money, pretty, statusLabels } from "../content";
import {
  ActionLink,
  Button,
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
} from "../ui";
import type { Assumptions, Cost, Offering, Shortlist } from "../types";

function SavedOffering({ item }: { item: Shortlist }) {
  const ws = useWorkspace(), task = useTask();
  const [status, setStatus] = useState(item.status), [note, setNote] = useState(item.note || "");
  const [removing, setRemoving] = useState(false);
  useEffect(() => { setStatus(item.status); setNote(item.note || ""); }, [item.status, item.note]);
  const dirty = status !== item.status || note !== (item.note || "");
  const course = item.facts;
  const selected = ws.compareIds.includes(item.offering_id);
  const remove = () => task.run(async () => {
    await write("/me/shortlist/" + encodeURIComponent(item.offering_id), undefined, "DELETE");
    if (selected) ws.toggleCompare(item.offering_id);
    await ws.refresh(); ws.notify("Course removed from your shortlist.");
  });
  return <article className={`shortlist-course ${selected ? "shortlist-course-selected" : ""}`}>
    <header className="shortlist-course-heading">
      <div><h2>{course ? <Link href={"/colleges/" + encodeURIComponent(item.offering_id)}>{course.name}</Link> : "This saved course is no longer published"}</h2>
        {course && <p>{course.program_name}</p>}
      </div>
      {course && <label className="shortlist-compare-check"><input type="checkbox" checked={selected} disabled={!selected && ws.compareIds.length >= 3} onChange={() => ws.toggleCompare(item.offering_id)} aria-label={`Compare ${course.name}, ${course.program_name}, ${course.academic_year || "year unknown"}`}/><span>Compare</span></label>}
    </header>
    {course ? <>
      <div className="shortlist-course-meta"><span><Icon name="pin" size={14}/>{course.district || "District not provided"}</span><span>{course.medium || "Medium not verified"}</span><span>{course.academic_year || "Year not provided"}</span></div>
      <dl className="shortlist-course-facts"><div><dt>Tuition / year</dt><dd>{money(course.tuition)}</dd></div><div><dt>Hostel</dt><dd>{course.hostel_status === "available" ? "Available" : course.hostel_status === "not_available" ? "Not available" : "Not verified"}</dd></div><div><dt>Your progress</dt><dd>{statusLabels[item.status] || pretty(item.status)}</dd></div></dl>
      <details className="shortlist-notes">
        <summary><span>Your notes & progress{item.note && <small>Private note saved</small>}</span><span className="shortlist-note-action">{dirty ? "Unsaved changes" : "Edit"}</span></summary>
        <form onSubmit={e => { e.preventDefault(); task.run(async () => { await write("/me/shortlist/" + encodeURIComponent(item.offering_id), {status, note:note || null}, "PUT"); await ws.refresh(); ws.notify("Your notes and progress are saved."); }); }}>
          <div className="shortlist-edit-grid"><Field label="My progress"><select aria-label={`Progress for ${course.name}`} value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label="My private note" hint="Only you can see this note. It is excluded from parent reports."><textarea aria-label={`Private note for ${course.name}`} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Questions to ask, things to check, reasons this course interests you…" rows={3}/></Field></div>
          <div className="shortlist-note-save"><Button type="submit" busy={task.busy} disabled={!dirty}>Save notes & progress</Button><span aria-live="polite">{dirty ? "You have unsaved changes" : "All changes saved"} · {note.length}/1,000 characters</span></div>
          {status.endsWith("_reported") && <p className="shortlist-reported">This progress is self-reported. It does not confirm official admission or allotment.</p>}
        </form>
      </details>
    </> : <div className="shortlist-unavailable"><p>Its published details are unavailable. You can keep the saved entry or remove it below.</p>{item.note && <div><strong>Your private note</strong><p>{item.note}</p></div>}</div>}
    <footer className="shortlist-course-footer">{course && <Link href={"/colleges/" + encodeURIComponent(item.offering_id)}>View course details <Icon name="up" size={15}/></Link>}<button onClick={() => setRemoving(!removing)} aria-expanded={removing} aria-controls={`remove-${item.id}`}>Remove from shortlist</button></footer>
    {removing && <div className="shortlist-remove-confirm" id={`remove-${item.id}`}><p>Remove this saved course? Its saved note and progress will also be removed.</p><div><Button variant="danger" busy={task.busy} onClick={remove}>Remove course</Button><Button variant="text" disabled={task.busy} onClick={() => setRemoving(false)}>Keep course</Button></div></div>}
    {task.error && <ErrorState message={task.error}/>}
  </article>;
}
export function ShortlistPage() {
  const ws = useWorkspace(), items = ws.dashboard!.shortlist;
  const [search, setSearch] = useState(""), [progress, setProgress] = useState("");
  const visible = items.filter(item => {
    const matches = !search.trim() || [item.facts?.name, item.facts?.program_name, item.facts?.district].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()));
    return matches && (!progress || item.status === progress);
  });
  return <div className="shortlist-page">
    <header className="shortlist-heading"><div><h1>Your options, together.</h1><p>A space to compare courses, keep questions, and plan your next move.</p></div><Link href="/colleges">Explore more courses <Icon name="up" size={16}/></Link></header>
    {items.length ? <>
      <section className="shortlist-desk" aria-label="Manage your shortlist">
        <div className="shortlist-desk-intro"><div><strong>{fmt(items.length)} saved {items.length === 1 ? "course" : "courses"}</strong><p>Select two or three courses from the same academic year to compare costs.</p></div>
          {ws.compareIds.length >= 2 ? <Link className="button primary" href="/compare">Compare selected ({ws.compareIds.length})</Link> : <span className="shortlist-selection-hint" role="status">{ws.compareIds.length ? "1 selected. Choose one more." : "Select courses using the checkboxes."}</span>}
        </div>
        {ws.compareIds.length > 0 && <div className="shortlist-selection-summary"><span>{ws.compareIds.length} of 3 selected. Selection is shared with college search.</span><button onClick={() => ws.compareIds.forEach(id => ws.toggleCompare(id))}>Clear selection</button></div>}
        <div className="shortlist-filters"><label className="shortlist-search"><Icon name="search" size={19}/><input type="search" aria-label="Search saved courses" placeholder="Find a saved college, course or district" value={search} onChange={e => setSearch(e.target.value)}/></label><label className="shortlist-progress-filter">Progress<select aria-label="Filter saved courses by progress" value={progress} onChange={e => setProgress(e.target.value)}><option value="">All progress</option>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      </section>
      <div className="shortlist-list-intro"><span role="status" aria-live="polite">{search || progress ? `${visible.length} of ${items.length} saved courses` : "Your saved courses"}</span><span>Saving a course is not an application.</span></div>
      <div className="shortlist-course-list" hidden={!visible.length}>{items.map(item => <div key={item.id} hidden={!visible.some(match => match.id === item.id)}><SavedOffering item={item}/></div>)}</div>{!visible.length && <div className="shortlist-empty"><Icon name="search" size={28}/><h2>No saved courses match.</h2><p>Try another name or clear your progress filter. Your saved courses are still here.</p><Button onClick={() => {setSearch("");setProgress("");}}>Show all saved courses</Button></div>}
      <p className="shortlist-privacy">Your notes are private and excluded from parent reports. Unverified fees and hostel details need confirmation with the college.</p>
    </> : <section className="shortlist-empty shortlist-first-course"><Icon name="bookmark" size={32}/><h2>Make room for possibilities.</h2><p>When a course catches your eye, save it from the directory. It will be here when you’re ready to compare costs or keep a private note.</p><Link href="/colleges" className="button primary">Find a course to save</Link><span>No application or commitment. Just your options.</span></section>}
  </div>;
}

const assumptionFields: [keyof Assumptions, string, string][] = [
  ["hostel_monthly", "Hostel / month", "Leave blank if not known"],
  ["food_monthly", "Food & mess / month", "Your estimate"],
  ["transport_monthly", "Local transport / month", "Your estimate"],
  ["travel_home_monthly", "Travel home / month", "Your estimate"],
  ["books_supplies", "Books & supplies / year", "Your estimate"],
];
export function CostCard({
  cost,
  compact = false,
}: {
  cost: Cost;
  compact?: boolean;
}) {
  const knownInstitutional = cost.lines.some(
      (l) =>
        l.status === "official_source" || l.status === "institution_source",
    ),
    personal = cost.lines.some((l) => l.status === "estimate");
  const hasKnown = knownInstitutional || personal;
  return (
    <section className="cost-card">
      <h2>{cost.institution_name}</h2>
      <p className="cost-total-label">
        {cost.academic_year} ·{" "}
        {cost.total_label === "at least"
          ? "Known lower bound"
          : "Estimated total"}
      </p>
      <div className="cost-total">
        {hasKnown ? money(cost.estimated_total) : "Not yet known"}
      </div>
      <p className="text-small muted">
        {cost.total_label === "at least"
          ? "Institutional fees are incomplete. This total is not the full cost."
          : "Includes student-entered assumptions."}
      </p>
      <div className="cost-breakdown">
        <div className="cost-row">
          <span>Verified institutional subtotal</span>
          <span>
            {knownInstitutional
              ? money(cost.verified_institutional_total)
              : "None verified"}
          </span>
        </div>
        <div className="cost-row">
          <span>Personal estimates subtotal</span>
          <span>
            {personal ? money(cost.estimated_personal_total) : "Not entered"}
          </span>
        </div>
      </div>
      {!compact && (
        <div className="cost-breakdown">
          <h3>Line by line</h3>
          {cost.lines.map((line, i) => (
            <div className="cost-row" key={i}>
              <span>
                {costLabels[line.kind] || pretty(line.kind)}
                <small
                  className="muted"
                  style={{ display: "block", fontSize: 11 }}
                >
                  {line.status === "estimate"
                    ? "Your estimate"
                    : line.status === "unknown"
                      ? "Not verified"
                      : "Sourced fee"}
                </small>
              </span>
              <span>
                {line.status === "unknown"
                  ? "—"
                  : money(line.annualized_amount_inr ?? line.amount_inr)}
              </span>
            </div>
          ))}
        </div>
      )}
      {cost.unknown_lines.length > 0 && (
        <p className="unknown-lines">
          Still unknown:{" "}
          {cost.unknown_lines.map((k) => costLabels[k] || pretty(k)).join(", ")}
          .
        </p>
      )}
    </section>
  );
}

export function ComparePage() {
  const ws = useWorkspace(),
    task = useTask();
  const [offerings, setOfferings] = useState<Offering[]>([]),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(""),
    [values, setValues] = useState<Record<string, Record<string, string>>>({}),
    [result, setResult] = useState<Cost[] | null>(null),
    [months, setMonths] = useState(10);
  const saved = useData<{ offerings: Cost[]; academic_year: string } | null>(
    "/costs/last",
  );
  const key = ws.compareIds.join("|");
  useEffect(() => {
    let active = true;
    setResult(null);
    if (!ws.compareIds.length) {
      setOfferings([]);
      return;
    }
    setLoading(true);
    setLoadError("");
    Promise.all(
      ws.compareIds.map((id) =>
        api<Offering>("/offerings/" + encodeURIComponent(id)),
      ),
    )
      .then((items) => {
        if (active) setOfferings(items);
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (
      saved.data &&
      saved.data.offerings.length === ws.compareIds.length &&
      saved.data.offerings.every((o) => ws.compareIds.includes(o.offering_id))
    ) {
      setResult(saved.data.offerings);
      const entries: Record<string, Record<string, string>> = {};
      for (const cost of saved.data.offerings) {
        entries[cost.offering_id] = Object.fromEntries(
          assumptionFields.map(([field]) => [
            field,
            cost.assumptions[field] == null
              ? ""
              : String(cost.assumptions[field]),
          ]),
        );
        setMonths(cost.assumptions.months || 10);
      }
      setValues(entries);
    }
  }, [saved.data, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const years = [...new Set(offerings.map((o) => o.academic_year))];
  const canCompare =
    offerings.length >= 2 && years.length === 1 && Boolean(years[0]);
  const compute = () =>
    task.run(async () => {
      if (!canCompare)
        throw new Error(
          "Choose two or three offerings from the same known academic year.",
        );
      const byOffering = Object.fromEntries(
        offerings.map((o) => [
          o.id,
          {
            months,
            ...Object.fromEntries(
              assumptionFields.map(([field]) => [
                field,
                numberOrNull(values[o.id]?.[field] || ""),
              ]),
            ),
          },
        ]),
      );
      const response = await write<{ offerings: Cost[] }>("/costs/compare", {
        offering_ids: offerings.map((o) => o.id),
        academic_year: years[0],
        assumptions: { months },
        assumptions_by_offering: byOffering,
      });
      setResult(response.offerings);
      ws.notify("Your cost comparison is saved for your parent report.");
    });
  return (
    <>
      <PageHeader
        title="Put the costs in perspective"
        description="Compare the fees we can verify with the living costs you estimate. Unknown is never the same as free."
        action={
          <ActionLink href="/report/new" variant="secondary" icon="book">
            Create a parent report
          </ActionLink>
        }
      />
      {ws.compareIds.length > 0 && (
        <div className="comparison-pickers">
          {ws.compareIds.map((id) => (
            <div className="compare-chip" key={id}>
              <span>
                {offerings.find((o) => o.id === id)?.program_name ||
                  "Selected offering"}
              </span>
              <button
                className="icon-button"
                aria-label={
                  "Remove " +
                  (offerings.find((o) => o.id === id)?.program_name ||
                    "offering") +
                  " from comparison"
                }
                onClick={() => ws.toggleCompare(id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!ws.compareIds.length ? (
        <Panel>
          <Empty
            title="A clearer comparison starts with two"
            action={
              <ActionLink href="/colleges" variant="primary">
                Choose offerings
              </ActionLink>
            }
          >
            Choose “Compare” on two or three program listings, or select from
            your saved offerings below.
          </Empty>
        </Panel>
      ) : loading ? (
        <Loading lines={3} />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <>
          {offerings.length < 2 && (
            <Notice>
              Choose one more offering from the directory or your shortlist to
              compare costs.
            </Notice>
          )}
          {offerings.length >= 2 && !canCompare && (
            <Notice>
              These offerings have different or unprovided academic years.
              Choose programs from the same verified year; fees from different
              years are never mixed.
            </Notice>
          )}
          <Panel
            className="section-gap"
            title="Your living-cost assumptions"
            action={
              <Field label="Months to budget for">
                <input
                  aria-label="Months to budget for"
                  style={{ width: 90 }}
                  type="number"
                  min={1}
                  max={12}
                  value={months}
                  onChange={(e) => {
                    setMonths(Number(e.target.value));
                    setResult(null);
                  }}
                />
              </Field>
            }
          >
            <p className="text-small muted">
              Enter your own estimates for living at home or away. Blank amounts
              stay unknown. A zero is used only when you enter it.
            </p>
            <div
              className={
                "assumption-columns section-gap " +
                (offerings.length === 2 ? "two" : "")
              }
            >
              {offerings.map((o) => (
                <div className="assumption-column" key={o.id}>
                  <h3>{o.name}</h3>
                  <p>
                    {o.program_name} · {o.academic_year || "Year not provided"}
                  </p>
                  {assumptionFields.map(([field, label, hint]) => (
                    <Field label={label} hint={hint} key={field}>
                      <input
                        aria-label={`${label} for ${o.program_name} ${o.id}`}
                        type="number"
                        min={0}
                        max={100000}
                        value={values[o.id]?.[field] || ""}
                        placeholder="Amount in INR"
                        onChange={(e) => {
                          setValues((v) => ({
                            ...v,
                            [o.id]: { ...v[o.id], [field]: e.target.value },
                          }));
                          setResult(null);
                        }}
                      />
                    </Field>
                  ))}
                </div>
              ))}
            </div>
            <div className="actions section-gap">
              <Button
                icon="scale"
                busy={task.busy}
                disabled={!canCompare}
                onClick={compute}
              >
                Calculate & save comparison
              </Button>
              <span className="text-small muted">
                {canCompare ? years[0] : "A shared academic year is needed"}
              </span>
            </div>
            {task.error && <ErrorState message={task.error} />}
          </Panel>
          {result && (
            <div
              className={"cost-results " + (result.length === 2 ? "two" : "")}
            >
              {result.map((cost) => (
                <CostCard key={cost.offering_id} cost={cost} />
              ))}
            </div>
          )}
        </>
      )}
      {ws.dashboard!.shortlist.length > 0 && (
        <Panel className="section-gap" title="Choose from your shortlist">
          <div className="flow">
            {ws.dashboard!.shortlist.map(
              (item) =>
                item.facts && (
                  <div className="actions spaced" key={item.offering_id}>
                    <div>
                      <strong>{item.facts.program_name}</strong>
                      <p className="text-small muted">
                        {item.facts.name} ·{" "}
                        {item.facts.academic_year || "Year not provided"}
                      </p>
                    </div>
                    <Button
                      variant="text"
                      onClick={() => ws.toggleCompare(item.offering_id)}
                      icon={
                        ws.compareIds.includes(item.offering_id)
                          ? "check"
                          : "plus"
                      }
                    >
                      {ws.compareIds.includes(item.offering_id)
                        ? "Selected"
                        : "Select"}
                    </Button>
                  </div>
                ),
            )}
          </div>
        </Panel>
      )}
      <p className="panel-note">
        The supplied data contains no institutional fee or hostel records.
        Living-cost estimates cannot fill that gap or make the final total
        complete.
      </p>
    </>
  );
}
