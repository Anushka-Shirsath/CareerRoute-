"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { write } from "../api";
import { useTask, useWorkspace } from "../context";
import { districts, fmt, pathways, route } from "../content";
import { Button, ErrorState, Field } from "../ui";

type Band = "safe" | "possible" | "reach";
type Recommendation = {
  offering_id: string; linkable: boolean; name: string; program_name: string;
  pathway_id: string; district: string | null; academic_year: string;
  first_round_percent: number; closing_percent: number; difference: number;
  rounds: number; source_url: string | null;
};
type Recommendations = {
  percent: number; category_used: string; counts: Record<Band, number>;
  counts_capped: boolean; groups: Record<Band, Recommendation[]>; notice: string;
};
const bands: Record<Band, { title: string; explanation: string }> = {
  safe: { title: "Stronger matches", explanation: "Your percentage meets or exceeds the recorded first-round cutoff." },
  possible: { title: "Possible options", explanation: "Your percentage meets the closing cutoff but is below the first-round cutoff." },
  reach: { title: "Reach options", explanation: "The recorded closing cutoff is up to 5 percentage points above your entry." },
};
const courseOptions = pathways.filter(p => ["fyjc_science", "fyjc_commerce", "fyjc_arts", "polytechnic_diploma"].includes(p.id));

function CollegeFitMatch({ item }: { item: Recommendation }) {
  const ws = useWorkspace(), save = useTask();
  const saved = ws.isSaved(item.offering_id);
  const difference = Math.abs(item.difference);
  const saveMatch = () => save.run(async () => {
    await write("/me/shortlist/" + encodeURIComponent(item.offering_id), saved ? undefined : { status: "shortlisted" }, saved ? "DELETE" : "PUT");
    await ws.refresh();
    ws.notify(saved ? "Removed from your shortlist." : "Added to your shortlist.");
  });
  return <article className="college-fit-match cutoff-result">
    <div>
      <h4>{item.linkable ? <Link href={"/colleges/" + encodeURIComponent(item.offering_id)}>{item.name}</Link> : item.name}</h4>
      <p>{item.program_name} · {route(item.pathway_id)?.name || item.pathway_id}</p>
      <small>{item.district || "District not provided"} · {item.academic_year} · {item.rounds} admission {item.rounds === 1 ? "round" : "rounds"} on record</small>
      <p className="college-fit-reason">{difference === 0 ? "Same as the recorded closing cutoff." : `${difference.toFixed(2)} percentage points ${item.difference > 0 ? "above" : "below"} the recorded closing cutoff.`}</p>
      <div className="college-fit-links">
        {item.linkable && <Link href={"/colleges/" + encodeURIComponent(item.offering_id)} aria-label={"View college details for " + item.name}>View college details ↗</Link>}
        {item.source_url?.startsWith("https://") && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Cutoff source ↗</a>}
      </div>
    </div>
    <div className="college-fit-comparison">
      <dl>
        <div><dt>Closing cutoff</dt><dd>{item.closing_percent}%</dd></div>
        <div><dt>First round</dt><dd>{item.first_round_percent}%</dd></div>
      </dl>
      {item.linkable && <Button variant="text" busy={save.busy} aria-label={(saved ? "Remove " : "Save ") + item.name} aria-pressed={saved} onClick={saveMatch}>{saved ? "Saved to shortlist · Remove" : "Save to shortlist"}</Button>}
      {save.error && <ErrorState message={save.error} />}
    </div>
  </article>;
}

export function CollegeFit() {
  const ws = useWorkspace(), task = useTask();
  const confirmedPercent = ws.dashboard?.academic_snapshot?.aggregate.value;
  const [percent, setPercent] = useState(confirmedPercent == null ? "" : String(confirmedPercent));
  const [district, setDistrict] = useState("");
  const [pathway, setPathway] = useState("");
  const [result, setResult] = useState<Recommendations | null>(null);
  const edited = useRef(false);
  const valid = percent.trim() !== "" && Number.isFinite(Number(percent)) && Number(percent) >= 0 && Number(percent) <= 100;
  useEffect(() => {
    if (!edited.current && confirmedPercent != null) setPercent(String(confirmedPercent));
  }, [confirmedPercent]);
  const invalidate = () => { setResult(null); task.setError(""); };
  const run = (selectedDistrict = district) => task.run(async () => {
    if (!valid) return;
    setResult(null);
    setResult(await write<Recommendations>("/recommendations", {
      percent: Number(percent), pathway_id: pathway || null,
      districts: selectedDistrict ? [selectedDistrict] : [], limit: 10,
    }));
  });
  const hasMatches = result && Object.values(result.groups).some(items => items.length > 0);
  return <section id="college-fit" className="college-fit marks-recommendations" aria-labelledby="college-fit-title">
    <header className="college-fit-intro">
      <h2 id="college-fit-title">College Fit</h2>
      <p>Your percentage. Your city. A place to start.</p>
    </header>
    <form onSubmit={event => { event.preventDefault(); void run(); }}>
      <fieldset disabled={task.busy} className="cutoff-fields">
        <legend className="sr-only">Find colleges using your percentage and location</legend>
        <div className="college-fit-inputs">
          <Field label="Your percentage" hint={confirmedPercent == null ? "Enter your Class 10 or admission merit percentage. No marksheet needed." : "From your confirmed marks. You can try another percentage."} className="college-fit-percentage">
            <input type="number" inputMode="decimal" min="0" max="100" step="0.01" required placeholder="e.g. 85" value={percent} onChange={event => { edited.current = true; setPercent(event.target.value); invalidate(); }} />
          </Field>
          <Field label="City / district" hint="Matches use Maharashtra districts, including colleges outside city limits.">
            <select value={district} onChange={event => { setDistrict(event.target.value); invalidate(); }}><option value="">All of Maharashtra</option>{districts.map(name => <option key={name}>{name}</option>)}</select>
          </Field>
          <Field label="Course">
            <select value={pathway} onChange={event => { setPathway(event.target.value); invalidate(); }}><option value="">All supported courses</option>{courseOptions.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select>
          </Field>
        </div>
        {percent !== "" && !valid && <p role="alert">Enter a percentage between 0 and 100.</p>}
        <div className="college-fit-submit"><Button type="submit" busy={task.busy} disabled={!valid}>Find my college fit</Button><p>Junior college & Polytechnic · No upload required</p></div>
      </fieldset>
    </form>
    {task.busy && <p role="status" className="college-fit-status">Comparing your percentage with recorded cutoffs…</p>}
    {task.error && <ErrorState message={task.error} />}
    <div aria-live="polite" aria-atomic="false">
      {result && <div className="cutoff-results">
        <h3>Your college fit at {result.percent}%</h3>
        <p>{district || "All of Maharashtra"} · {courseOptions.find(p => p.id === pathway)?.name || "All supported courses"} · Category: {result.category_used}</p>
        <p className="college-fit-method">Ordered by historical cutoff within each group. A higher cutoff does not measure college quality. You can set an optional category in Your preferences below.</p>
        {!hasMatches ? <div className="college-fit-empty"><h4>No historical matches for these choices.</h4><p>Try another course{district ? " or search across Maharashtra" : ""}. Some colleges have no comparable cutoff records.</p>{district && <Button variant="text" onClick={() => { setDistrict(""); void run(""); }}>Search all districts</Button>}<Link href="/colleges">Browse the college directory ↗</Link></div> : (Object.keys(bands) as Band[]).map(band => <section className="recommend-band" key={band} aria-labelledby={"fit-band-" + band}>
          <h3 id={"fit-band-" + band}>{bands[band].title} <span>({fmt(result.counts[band])}{result.counts_capped ? "+" : ""})</span></h3>
          <p>{bands[band].explanation}</p>
          {result.groups[band].length === 0 ? <p className="college-fit-status">No recorded matches in this group.</p> : <>
            {result.groups[band].map(item => <CollegeFitMatch key={item.offering_id} item={item} />)}
            {result.counts[band] > result.groups[band].length && <p className="college-fit-status">Showing {result.groups[band].length} of {fmt(result.counts[band])}{result.counts_capped ? "+" : ""} recorded matches. Narrow your course or district for a smaller list.</p>}
          </>}
        </section>)}
        <p className="college-fit-notice">{result.notice}</p>
      </div>}
    </div>
  </section>;
}
