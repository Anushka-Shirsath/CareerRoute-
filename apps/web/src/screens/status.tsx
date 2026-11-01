"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { fmt } from "../content";
import { Button, PageHeader, Panel, Tag } from "../ui";
import type { AuthStatus } from "../types";

type Health = {
  status: string;
  database: string;
  mode: string;
  mentor_configured: boolean;
};
type Stats = {
  institutions: number;
  offerings: number;
  sources: number;
  historical_records: number;
  districts: number;
};
type Check = {
  label: string;
  detail: string;
  state: "ok" | "off" | "down";
};

async function timed<T>(load: () => Promise<T>) {
  const started = performance.now();
  const value = await load();
  return { value, ms: Math.round(performance.now() - started) };
}

async function health(): Promise<Health> {
  const response = await fetch("/api-health", { cache: "no-store" });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value?.data) throw new Error("unavailable");
  return value.data;
}

export function StatusPage() {
  const [checks, setChecks] = useState<Check[] | null>(null),
    [stats, setStats] = useState<Stats | null>(null),
    [checkedAt, setCheckedAt] = useState(""),
    [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const [h, s, a] = await Promise.allSettled([
      timed(health),
      api<Stats>("/catalogue/stats"),
      api<AuthStatus>("/auth/status"),
    ]);
    const up = h.status === "fulfilled";
    setChecks([
      {
        label: "Website and API",
        detail: up ? `Answered in ${h.value.ms} ms` : "Not answering right now",
        state: up ? "ok" : "down",
      },
      {
        label: "College database",
        detail: up && h.value.value.database === "connected"
          ? "Connected and readable"
          : "Not reachable",
        state: up && h.value.value.database === "connected" ? "ok" : "down",
      },
      {
        label: "AI mentor",
        detail: !up
          ? "Unknown while the API is down"
          : h.value.value.mentor_configured
            ? "Ready. Guided answers fall back safely if the AI service is busy"
            : "Switched off. Guided answers still work",
        state: !up ? "down" : h.value.value.mentor_configured ? "ok" : "off",
      },
      {
        label: "Accounts",
        detail: a.status !== "fulfilled"
          ? "Unknown"
          : a.value.enabled
            ? "Sign-in is available"
            : "Guest workspaces only",
        state: a.status !== "fulfilled" ? "down" : a.value.enabled ? "ok" : "off",
      },
    ]);
    setStats(s.status === "fulfilled" ? s.value : null);
    setCheckedAt(new Date().toLocaleTimeString());
    setBusy(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const down = checks?.some((c) => c.state === "down");
  return (
    <>
      <PageHeader
        title="Service status"
        description="A live check of each part of CareerQuest, run from your browser."
        action={
          <Button variant="secondary" icon="refresh" busy={busy} onClick={run}>
            Check again
          </Button>
        }
      />
      <Panel className={"status-summary " + (checks ? (down ? "is-down" : "is-ok") : "")}>
        <span className="status-light" aria-hidden="true" />
        <div>
          <h2>
            {!checks
              ? "Checking…"
              : down
                ? "Something isn’t answering"
                : "Everything is working"}
          </h2>
          <p role="status">
            {checkedAt ? `Last checked at ${checkedAt}.` : "Running the first check."}
          </p>
        </div>
      </Panel>
      <ul className="status-list" aria-label="Service checks">
        {(checks || []).map((check) => (
          <li key={check.label} className={"status-row state-" + check.state}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
            <Tag tone={check.state === "ok" ? "positive" : check.state === "off" ? "neutral" : "warning"}>
              {check.state === "ok" ? "Working" : check.state === "off" ? "Off" : "Down"}
            </Tag>
          </li>
        ))}
      </ul>
      {stats && (
        <Panel title="What the catalogue holds" className="status-stats">
          <dl>
            <div>
              <dt>Institutions</dt>
              <dd>{fmt(stats.institutions)}</dd>
            </div>
            <div>
              <dt>Course offerings</dt>
              <dd>{fmt(stats.offerings)}</dd>
            </div>
            <div>
              <dt>Past cutoff records</dt>
              <dd>{fmt(stats.historical_records)}</dd>
            </div>
            <div>
              <dt>Official sources</dt>
              <dd>{fmt(stats.sources)}</dd>
            </div>
            <div>
              <dt>Districts</dt>
              <dd>{fmt(stats.districts)}</dd>
            </div>
          </dl>
        </Panel>
      )}
    </>
  );
}
