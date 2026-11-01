"use client";
import Link from "next/link";
import { useWorkspace, useTask } from "../context";
import { write } from "../api";
import { pathways, route, fmt, checklistLabels } from "../content";
import {
  ActionLink,
  Button,
  CollegeRow,
  Icon,
  Notice,
  Panel,
  Tag,
  TextLink,
  ErrorState,
} from "../ui";

export function HomePage() {
  const ws = useWorkspace(),
    task = useTask(),
    d = ws.dashboard!;
  const academic = d.academic_snapshot;
  const completed = d.next_steps.filter((item) => item.done).length;
  const subjects = academic?.subjects || ws.draft?.subjects || [];
  const preview = ["mathematics", "science", "english"]
    .map((key) => subjects.find((s) => s.canonical_subject === key))
    .filter(Boolean);
  const goal = route(d.profile.active_goal_pathway);
  return (
    <>
      <header className="home-hero">
        <h1>{ws.t("hero_title")}</h1>
        <p>{ws.t("hero_text")}</p>
      </header>
      <div className="demo-line">
        <Tag>{ws.t("demo")}</Tag>
        <span>
          {ws.t("sample")} · {ws.t("private")}
        </span>
      </div>
      <div className="grid home-grid home-lead stretch">
        <Panel className="span-9 next-panel">
          <div className="actions spaced">
            <h2>
              {academic
                ? "A starting point, not a verdict."
                : "Start with what you know."}
            </h2>
            <Tag tone={academic ? "positive" : "neutral"}>
              {academic ? "You confirmed this" : ws.draft ? "Draft result" : "Get started"}
            </Tag>
          </div>
          <p>
            {academic
              ? "Your marks are one part of the picture. Interests, practical needs and the work you enjoy matter too."
              : ws.draft
                ? "Your sample Class 10 marks are ready. Review and confirm them before they inform your academic snapshot."
                : "Enter a sample Class 10 result to start building your academic snapshot."}
          </p>
          <div className="draft-preview">
            {preview.map(
              (s) =>
                s && (
                  <div key={s.name_as_shown}>
                    <small>{s.name_as_shown}</small>
                    <strong>
                      {s.obtained ?? s.grade_label}
                      <span>{s.obtained != null ? ` / ${s.maximum}` : ""}</span>
                    </strong>
                  </div>
                ),
            )}
          </div>
          <div className="actions">
            <ActionLink
              href={
                academic ? "/snapshot" : ws.draft ? "/start/review" : "/start"
              }
              variant="primary"
            >
              {academic ? "View my snapshot" : ws.draft ? "Review sample marks" : "Enter sample marks"}
            </ActionLink>
            <ActionLink href="/start" variant="text" icon="up">
              {academic ? "Edit result" : "Enter a sample result"}
            </ActionLink>
          </div>
        </Panel>
        <Panel title="Follow your curiosity" className="span-3 compass-invite">
          <svg
            className="compass-motif"
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="40"
              cy="40"
              r="29"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <circle
              cx="40"
              cy="40"
              r="20"
              stroke="currentColor"
              strokeWidth=".6"
            />
            <path d="M40 3v10m0 54v10M3 40h10m54 0h10" stroke="currentColor" />
            <path d="m50 26-6 18-18 6 6-18Z" fill="currentColor" />
            <circle cx="40" cy="40" r="3" className="compass-motif-hub" />
          </svg>
          <p>
            Build a school festival. Make a few choices. Notice what you enjoy.
          </p>
          <ActionLink
            href={d.compass_summary ? "/compass/report" : "/compass/play"}
            variant="secondary"
          >
            {d.compass_summary ? "See my Compass" : "Try Career Compass"}
          </ActionLink>
        </Panel>
      </div>
      <h2 className="home-section-heading">{ws.t("journey")}</h2>
      <div className="journey-strip" role="group" aria-label="Your exploration progress">
        {[
          {
            label: ws.t("j_marks"),
            value: academic
              ? "Confirmed"
              : ws.draft
                ? "Ready to review"
                : "Not entered",
            detail: academic
              ? `${academic.subjects.length} subjects saved`
              : ws.draft
                ? `${ws.draft.subjects.length} sample subjects`
                : "Start with a sample result",
            href: academic ? "/snapshot" : ws.draft ? "/start/review" : "/start",
            done: !!academic,
          },
          {
            label: ws.t("j_interests"),
            value: d.compass_summary ? "Explored" : "Open to explore",
            detail: d.compass_summary
              ? "Your Compass is ready"
              : "A short, optional mission",
            href: d.compass_summary ? "/compass/report" : "/compass/play",
            done: !!d.compass_summary,
          },
          {
            label: ws.t("j_shortlist"),
            value: `${d.shortlist.length} saved`,
            detail: d.shortlist.length
              ? "Keep your options together"
              : "A space for your possibilities",
            href: "/shortlist",
            done: d.shortlist.length > 0,
          },
          {
            label: ws.t("j_plan"),
            value: `${completed} of ${d.next_steps.length}`,
            detail: "Preparation steps completed",
            href: "/dashboard#next-steps",
            done: d.next_steps.length > 0 && completed === d.next_steps.length,
          },
        ].map((step) => (
          <div className="journey-step" key={step.label}>
            <Link href={step.href}>
              <span className="journey-label">
                <span
                  className={"journey-status " + (step.done ? "complete" : "")}
                />
                {step.label}
              </span>
              <strong>{step.value}</strong>
              <p>{step.detail}</p>
            </Link>
          </div>
        ))}
      </div>
      <div className="grid home-grid stretch">
        <Panel
          className="span-7"
          title="Six routes. Yours to choose."
          action={<TextLink href="/explore">Explore all</TextLink>}
        >
          <div className="route-list">
            {pathways.map((p) => (
              <Link key={p.id} href={"/explore/" + p.id}>
                <span>
                  <strong>{p.short}</strong>
                  <small>{p.duration}</small>
                </span>
                <Icon name="up" size={16} />
              </Link>
            ))}
          </div>
          <p className="panel-note">
            No route is a verdict on your ability. Your goal can change.
          </p>
        </Panel>
        <Panel
          id="next-steps"
          className="span-5"
          title="A little progress, your way"
          action={<TextLink href="/report/new">Make a report</TextLink>}
        >
          <div className="goal-line">
            <span>
              Your saved goal
              <strong>{goal?.name || "Choose a route to explore"}</strong>
            </span>
            <Link href="/explore" className="text-link">
              Change
            </Link>
          </div>
          {d.next_steps.map((item) => (
            <div
              className={"checklist-row " + (item.done ? "is-done" : "")}
              key={item.id}
            >
              <input
                id={item.id}
                type="checkbox"
                checked={item.done}
                disabled={task.busy}
                onChange={() =>
                  task.run(async () => {
                    await write(
                      "/me/checklist/" + item.id,
                      { done: !item.done },
                      "PUT",
                    );
                    await ws.refresh();
                  })
                }
              />
              <label htmlFor={item.id}>
                {checklistLabels[item.label_key] || item.label_key}
              </label>
            </div>
          ))}
          {!d.next_steps.length && (
            <p className="muted text-small">
              Choose a goal to create your preparation checklist.
            </p>
          )}
          {task.error && <ErrorState message={task.error} />}
        </Panel>
      </div>
      <div className="mentor-prompt">
        <Icon name="chat" size={22} />
        <div>
          <strong>A question on your mind?</strong>
          <p>
            The mentor can help you understand your saved information and the
            things we don’t know yet.
          </p>
        </div>
        <TextLink href="/mentor">Ask the mentor</TextLink>
      </div>
      {d.shortlist.length > 0 && (
        <Panel
          title="Your saved possibilities"
          className="section-gap"
          action={<TextLink href="/shortlist">View shortlist</TextLink>}
        >
          {d.shortlist
            .slice(0, 2)
            .map(
              (item) =>
                item.facts && (
                  <CollegeRow key={item.id} offering={item.facts} compact />
                ),
            )}
        </Panel>
      )}
      {ws.stats && (
        <div className="stats-line">
          <span>
            <strong>{fmt(ws.stats.institutions)}</strong>published institutions
          </span>
          <span>
            <strong>{fmt(ws.stats.offerings)}</strong>source-linked offerings
          </span>
          <span>
            <strong>{fmt(ws.stats.sources)}</strong>source records
          </span>
          <span style={{ marginLeft: "auto", alignSelf: "center" }}>
            <TextLink href="/data">See what our data covers</TextLink>
          </span>
        </div>
      )}
    </>
  );
}

