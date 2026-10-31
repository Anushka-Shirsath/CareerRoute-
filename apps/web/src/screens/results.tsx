"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useData, useTask, useWorkspace } from "../context";
import { api, write, numberOrNull } from "../api";
import { pathways, pretty, route } from "../content";
import {
  ActionLink,
  Button,
  CheckField,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Tag,
} from "../ui";
import type { Academic, Page, Result, Subject } from "../types";

const initialSubjects: Subject[] = [
  {
    canonical_subject: "english",
    name_as_shown: "English",
    obtained: null,
    maximum: 100,
    grade_label: null,
    source: "typed",
  },
  {
    canonical_subject: "mathematics",
    name_as_shown: "Mathematics",
    obtained: null,
    maximum: 100,
    grade_label: null,
    source: "typed",
  },
  {
    canonical_subject: "science",
    name_as_shown: "Science",
    obtained: null,
    maximum: 100,
    grade_label: null,
    source: "typed",
  },
];
const canonical = [
  "english",
  "mathematics",
  "science",
  "social_science",
  "first_language",
  "second_language",
  "third_language",
  "other",
] as const;
export function MarksPage({ review = false }: { review?: boolean }) {
  const ws = useWorkspace(),
    router = useRouter(),
    task = useTask();
  const [board, setBoard] = useState<"SSC_MH" | "CBSE" | "ICSE">("SSC_MH"),
    [year, setYear] = useState(2026),
    [type, setType] = useState<"manual" | "official" | "provisional">("manual"),
    [subjects, setSubjects] = useState<Subject[]>(initialSubjects),
    [mode, setMode] = useState<"manual" | "pdf">("manual"),
    [confirmed, setConfirmed] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [record, setRecord] = useState<Result | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    const draft = ws.draft;
    if (draft) {
      setRecord(draft);
      setBoard(draft.board);
      setYear(draft.exam_year);
      setType(draft.result_type);
      setSubjects(draft.subjects.map((s) => ({ ...s })));
      initialized.current = true;
    } else if (ws.dashboard?.academic_snapshot && !review) {
      const a = ws.dashboard.academic_snapshot;
      setBoard(a.board || "SSC_MH");
      setYear(a.exam_year || 2026);
      setSubjects(
        a.subjects.map((s) => ({
          canonical_subject: s.canonical_subject,
          name_as_shown: s.name_as_shown,
          obtained: s.obtained,
          maximum: s.maximum,
          grade_label: s.grade_label,
          source: "typed",
        })),
      );
      initialized.current = true;
    }
  }, [ws.draft, ws.dashboard, review]);
  const update = (index: number, field: keyof Subject, value: unknown) => {
    setSubjects((items) =>
      items.map((s, i) =>
        i === index
          ? ({
              ...s,
              [field]: value,
              source:
                s.source === "extracted" ? "extracted_then_corrected" : "typed",
            } as Subject)
          : s,
      ),
    );
    setConfirmed(false);
  };
  const validate = () => {
    if (!subjects.length) throw new Error("Add at least one subject.");
    const seen = new Set<string>();
    for (const s of subjects) {
      if (!s.name_as_shown.trim()) throw new Error("Give each subject a name.");
      const name = s.name_as_shown.trim().toLowerCase();
      if (seen.has(name))
        throw new Error("Each subject needs a distinct name.");
      seen.add(name);
      if (s.obtained == null && !s.grade_label)
        throw new Error(`Enter marks or a grade for ${s.name_as_shown}.`);
      if (
        s.obtained != null &&
        (!s.maximum ||
          s.maximum <= 0 ||
          s.obtained < 0 ||
          s.obtained > s.maximum)
      )
        throw new Error(
          `Check the obtained and maximum marks for ${s.name_as_shown}.`,
        );
    }
  };
  const save = () =>
    task.run(async () => {
      validate();
      const result = await write<Result>("/results/manual", {
        board,
        exam_year: year,
        result_type: type,
        subjects,
      });
      await ws.refresh();
      setRecord(result);
      router.push("/start/review");
    });
  const confirm = () =>
    task.run(async () => {
      validate();
      if (!confirmed)
        throw new Error("Confirm that you have reviewed these sample marks.");
      let id = record?.result_id;
      if (
        !id ||
        record?.board !== board ||
        record?.exam_year !== year ||
        record?.result_type !== type
      ) {
        const created = await write<Result>("/results/manual", {
          board,
          exam_year: year,
          result_type: type,
          subjects,
        });
        id = created.result_id;
      }
      await write(
        "/results/" + id + "/confirm",
        { confirm: true, subjects },
        "PUT",
      );
      await ws.refresh();
      ws.notify("Your result is confirmed. Your snapshot is ready.");
      router.push("/snapshot");
    });
  const extract = () =>
    task.run(async () => {
      if (!file) throw new Error("Choose a sample PDF or image first.");
      const extension = file.name.toLowerCase();
      const mime = file.type === "application/pdf" || extension.endsWith(".pdf") ? "application/pdf" : file.type === "image/png" || extension.endsWith(".png") ? "image/png" : file.type === "image/jpeg" || /\.jpe?g$/.test(extension) ? "image/jpeg" : "";
      if (!mime) throw new Error("Choose a PDF, PNG, or JPEG file.");
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a file smaller than 5 MiB.");
      const signed = await write<{ upload_url: string; document_id: string }>(
        "/results/upload-url",
        { mime, size: file.size },
      );
      const url = new URL(signed.upload_url, window.location.origin);
      const upload = await fetch(url.pathname + url.search, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mime },
        credentials: "include",
      });
      if (!upload.ok) {
        const body = await upload.json();
        throw new Error(
          body?.error?.message || "The file could not be uploaded.",
        );
      }
      const draft = await write<Result>("/results/extract", {
        document_id: signed.document_id,
        board,
        exam_year: year,
      });
      setRecord(draft);
      setSubjects(draft.subjects);
      await ws.refresh();
      router.push("/start/review");
    });
  return (
    <>
      <PageHeader
        title={review ? "Review your result" : "Your Class 10 result"}
        description={
          review
            ? "Check every subject before confirming. Only confirmed marks inform your academic snapshot."
            : "Start with a sample marksheet or enter sample marks. You’re always in control of what gets used."
        }
        action={
          ws.dashboard?.academic_snapshot ? (
            <ActionLink href="/snapshot">View current snapshot</ActionLink>
          ) : undefined
        }
      />
      <div className="grid">
        <Panel
          className="span-8"
          title={review ? "Does this look right?" : "Add your result"}
          action={
            <Tag>{review ? "Not used until confirmed" : "Demo data only"}</Tag>
          }
        >
          {!review && (
            <div
              className="tab-bar"
              role="tablist"
              aria-label="Result entry method"
            >
              <button
                role="tab"
                aria-selected={mode === "manual"}
                className={mode === "manual" ? "selected" : ""}
                onClick={() => setMode("manual")}
              >
                Enter marks
              </button>
              <button
                role="tab"
                aria-selected={mode === "pdf"}
                className={mode === "pdf" ? "selected" : ""}
                onClick={() => setMode("pdf")}
              >
                Upload a file
              </button>
            </div>
          )}
          <div className="form-grid three">
            <Field label="Board">
              <select
                value={board}
                onChange={(e) => setBoard(e.target.value as typeof board)}
              >
                <option value="SSC_MH">Maharashtra SSC</option>
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE</option>
              </select>
            </Field>
            <Field label="Exam year">
              <input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </Field>
            <Field label="Result type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="manual">Entered manually</option>
                <option value="official">Published result</option>
                <option value="provisional">Provisional result</option>
              </select>
            </Field>
          </div>
          {mode === "pdf" && !review ? (
            <div className="section-gap">
              <div className="upload-zone">
                <Icon name="upload" size={28} />
                <p>
                  Use a synthetic PDF or image with subject rows such as
                  “Mathematics 84/100”, or a table labelled Subject, Maximum
                  and Obtained. Scans are read locally and can contain errors;
                  check all marks and add any missing subjects manually.
                </p>
                <Field
                  label="Sample marksheet file"
                  hint="PDF, PNG or JPEG up to 5 MiB; PDFs may have up to 3 pages. Do not upload a real marksheet."
                >
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </Field>
              </div>
              <div className="actions section-gap">
                <Button busy={task.busy} onClick={extract} icon="file">
                  Extract a draft
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="panel-note section-gap">As shown on the sample marksheet. Blank values stay unknown. Scroll across to check every column.</p>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Subject marks, scroll horizontally for all columns">
                <table className="subject-table">
                  <caption className="sr-only">Subject marks</caption>
                  <thead>
                    <tr>
                      <th scope="col">Subject name</th>
                      <th scope="col">Subject group</th>
                      <th scope="col" className="num">
                        Obtained
                      </th>
                      <th scope="col" className="num">
                        Maximum
                      </th>
                      <th scope="col">Grade</th>
                      <th scope="col">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            aria-label={`Subject ${i + 1} name`}
                            value={s.name_as_shown}
                            onChange={(e) =>
                              update(i, "name_as_shown", e.target.value)
                            }
                            maxLength={100}
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Subject ${i + 1} group`}
                            value={s.canonical_subject}
                            onChange={(e) =>
                              update(i, "canonical_subject", e.target.value)
                            }
                          >
                            {canonical.map((c) => (
                              <option value={c} key={c}>
                                {pretty(c)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Subject ${i + 1} obtained marks`}
                            type="number"
                            min="0"
                            value={s.obtained ?? ""}
                            onChange={(e) =>
                              update(
                                i,
                                "obtained",
                                numberOrNull(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Subject ${i + 1} maximum marks`}
                            type="number"
                            min="1"
                            value={s.maximum ?? ""}
                            onChange={(e) =>
                              update(i, "maximum", numberOrNull(e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Subject ${i + 1} grade`}
                            placeholder="—"
                            value={s.grade_label ?? ""}
                            onChange={(e) =>
                              update(i, "grade_label", e.target.value || null)
                            }
                            maxLength={20}
                          />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Remove subject ${i + 1}`}
                            onClick={() =>
                              setSubjects((items) =>
                                items.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            <Icon name="close" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="text-link section-gap"
                onClick={() =>
                  setSubjects((items) => [
                    ...items,
                    {
                      canonical_subject: "other",
                      name_as_shown: "",
                      obtained: null,
                      maximum: 100,
                      grade_label: null,
                      source: "typed",
                    },
                  ])
                }
                disabled={subjects.length >= 30}
              >
                <Icon name="plus" size={16} />
                Add a subject
              </button>
              {review && (
                <div className="section-gap">
                  <CheckField
                    label="I have checked these sample marks"
                    description="Use these confirmed marks for my academic snapshot. I can revise them later."
                    checked={confirmed}
                    onChange={setConfirmed}
                  />
                </div>
              )}
              <div className="actions section-gap">
                <Button
                  busy={task.busy}
                  onClick={review ? confirm : save}
                  disabled={review && !confirmed}
                  icon={review ? "check" : "arrow"}
                >
                  {review ? "Confirm my result" : "Review these marks"}
                </Button>
                {review && (
                  <ActionLink href="/start" variant="text">
                    Back to entry
                  </ActionLink>
                )}
              </div>
            </>
          )}
          {task.error && <ErrorState message={task.error} />}
        </Panel>
        <div className="span-4 flow">
          <Panel title="Your marks are a starting point">
            <p className="muted">
              They can help you reflect on a subject. They don’t decide which
              route you are allowed to want.
            </p>
            <div className="readiness-row">
              <strong>Check, then confirm</strong>
              <p>
                File extraction creates a draft. It never confirms or corrects
                itself.
              </p>
            </div>
            <div className="readiness-row">
              <strong>Grades are welcome</strong>
              <p>
                For a grade-only subject, leave marks blank and enter the grade.
              </p>
            </div>
            <div className="readiness-row">
              <strong>Keep unknowns unknown</strong>
              <p>
                The displayed average is not an official admission aggregate.
                Board-specific rules are still unverified.
              </p>
            </div>
          </Panel>
          <Notice icon="shield">
            This is an assignment demo. Please use synthetic results and sample
            files, not personal marksheets.
          </Notice>
        </div>
      </div>
    </>
  );
}

export function SnapshotPage() {
  const ws = useWorkspace();
  const a = ws.dashboard!.academic_snapshot;
  if (!a)
    return (
      <>
        <PageHeader title="Your academic snapshot" />
        <Panel>
          <Empty
            title="A confirmed result comes first"
            action={
              <ActionLink href="/start/review" variant="primary">
                Review sample marks
              </ActionLink>
            }
          >
            Draft marks stay out of your snapshot. Review and confirm a result
            when you’re ready.
          </Empty>
        </Panel>
      </>
    );
  return (
    <>
      <PageHeader
        title="Your academic snapshot"
        description="A picture of this result, with room for what comes next."
        action={<ActionLink href="/start">Revise my marks</ActionLink>}
      />
      <div className="grid">
        <Panel
          className="span-8"
          title="Your confirmed subjects"
          action={<Tag tone="positive">You confirmed this</Tag>}
        >
          <p className="muted text-small">
            {a.board === "SSC_MH" ? "Maharashtra SSC" : a.board} · {a.exam_year}{" "}
            · Demo data
          </p>
          <div
            className="subject-chart"
            role="img"
            aria-label={a.subjects
              .map(
                (s) =>
                  `${s.name_as_shown}: ${s.percentage == null ? s.grade_label : s.percentage + "%"}`,
              )
              .join("; ")}
          >
            {a.subjects.map((s, i) => (
              <div className="subject-bar-row" key={i}>
                <span>{s.name_as_shown}</span>
                <div className="subject-bar-track">
                  <div
                    className="subject-bar-fill"
                    style={{
                      width: s.percentage == null ? 0 : s.percentage + "%",
                    }}
                  />
                </div>
                <span className="num">
                  {s.percentage == null
                    ? s.grade_label
                    : s.percentage.toFixed(1) + "%"}
                </span>
              </div>
            ))}
          </div>
          <details className="filter-disclosure">
            <summary>
              Read the marks as a table <Icon name="down" size={15} />
            </summary>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Confirmed subjects table">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th className="num">Obtained</th>
                    <th className="num">Maximum</th>
                    <th className="num">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {a.subjects.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name_as_shown}</td>
                      <td className="num">{s.obtained ?? s.grade_label}</td>
                      <td className="num">{s.maximum ?? "—"}</td>
                      <td className="num">
                        {s.percentage == null
                          ? "—"
                          : s.percentage.toFixed(1) + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>
        <Panel className="span-4" title="One useful reference">
          <div className="result-summary">
            <strong>
              {a.aggregate.value == null
                ? "—"
                : a.aggregate.value.toFixed(1) + "%"}
            </strong>
          </div>
          <p className="text-small muted">{a.aggregate.label}</p>
          <p className="panel-note">
            This is not an admission merit score. Historical records need the
            same verified metric before a comparison is possible.
          </p>
          <div className="section-gap">
            <Notice>
              Your choices stay open. Science, Commerce, Arts, Polytechnic, ITI
              and vocational routes are all worth exploring.
            </Notice>
          </div>
        </Panel>
        <Panel className="span-6" title="What this result can tell you">
          <div className="flow">
            {a.observations.map((text, i) => (
              <p className="muted" key={i}>
                {text}
              </p>
            ))}
          </div>
        </Panel>
        <Panel className="span-6" title="Add another part of the picture">
          <p className="muted">
            Your interests deserve a say too. Try an optional school-festival
            mission, or compare your marks with historical college cutoffs.
          </p>
          <div className="actions section-gap">
            <ActionLink href="/compass/play" variant="primary">
              Explore my interests
            </ActionLink>
            <ActionLink href="/finder#cutoff-explorer" variant="text">
              Compare marks with cutoffs
            </ActionLink>
          </div>
        </Panel>
      </div>
    </>
  );
}
