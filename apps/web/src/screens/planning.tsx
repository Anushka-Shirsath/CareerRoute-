"use client";
import { useEffect, useState } from "react";
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
  const ws = useWorkspace(),
    task = useTask();
  const [status, setStatus] = useState(item.status),
    [note, setNote] = useState(item.note || "");
  useEffect(() => {
    setStatus(item.status);
    setNote(item.note || "");
  }, [item.status, item.note]);
  if (!item.facts)
    return (
      <Panel>
        <p>This saved offering is no longer published.</p>
        <Button
          variant="text"
          onClick={() =>
            task.run(async () => {
              await write(
                "/me/shortlist/" + encodeURIComponent(item.offering_id),
                undefined,
                "DELETE",
              );
              await ws.refresh();
            })
          }
        >
          Remove from shortlist
        </Button>
      </Panel>
    );
  return (
    <section className="saved-offering">
      <CollegeRow offering={item.facts} />
      <div className="saved-controls">
        <Field label="My progress">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="A private note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Something you want to ask or remember"
            rows={1}
          />
        </Field>
        <Button
          variant="secondary"
          busy={task.busy}
          disabled={status === item.status && note === (item.note || "")}
          onClick={() =>
            task.run(async () => {
              await write(
                "/me/shortlist/" + encodeURIComponent(item.offering_id),
                { status, note: note || null },
                "PUT",
              );
              await ws.refresh();
              ws.notify("Your shortlist progress is saved.");
            })
          }
        >
          Save progress
        </Button>
      </div>
      {status.endsWith("_reported") && (
        <p className="panel-note">
          This is a status you reported. CareerQuest does not confirm official
          admission or allotment.
        </p>
      )}
      {task.error && <ErrorState message={task.error} />}
    </section>
  );
}
export function ShortlistPage() {
  const ws = useWorkspace();
  const items = ws.dashboard!.shortlist;
  return (
    <>
      <PageHeader
        title="Keep your options together"
        description="A shortlist is a place to explore, compare and ask better questions. Saving a program is not an application."
        action={
          <ActionLink
            href="/compare"
            variant={items.length > 1 ? "primary" : "secondary"}
            icon="scale"
          >
            Compare costs
          </ActionLink>
        }
      />
      {items.length ? (
        <>
          <div className="list-intro">
            <strong>
              {fmt(items.length)} saved offering{items.length === 1 ? "" : "s"}
            </strong>
            <span>Your notes stay private, including in parent reports.</span>
          </div>
          {items.map((item) => (
            <SavedOffering key={item.id} item={item} />
          ))}
        </>
      ) : (
        <Panel>
          <Empty
            title="Your shortlist is open"
            action={
              <ActionLink href="/colleges" variant="primary">
                Find your first possibility
              </ActionLink>
            }
          >
            Save a real program from the directory. You can compare costs and
            track the preparation you report here.
          </Empty>
        </Panel>
      )}
    </>
  );
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
