"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { route } from "../content";
import { Bolt, roles, type Dimension } from "./compass-fun";
import {
  CAREERS, DIMENSIONS, EXPERIMENTS, QUEST_STORAGE_NAME, buildQuest, emptyTally, interestProfile,
  levelFor, matchCareers, matchRoutes, type InterestOption, type Question, type Tally,
} from "./career-quest-data";

type Phase = "intro" | "play" | "results";
type Feedback = { correct: boolean | null; title: string; body: string; xp: number; card?: string };
type Saved = { best: number; plays: number; top?: Dimension };
const KIND_LABEL: Record<Question["kind"], string> = { scenario: "What would you do?", versus: "This or that", myth: "Myth or fact?", guess: "Who am I?" };
const SPEED_SECONDS = 5;
const tanker = localFont({ src: "../../public/fonts/tanker-regular.woff2", variable: "--quest-display", display: "swap" });

export function CareerQuest({ onContinue }: { onContinue: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [quest, setQuest] = useState<Question[]>([]);
  const [round, setRound] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [knowledge, setKnowledge] = useState({ right: 0, total: 0 });
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [cards, setCards] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saved, setSaved] = useState<Saved>({ best: 0, plays: 0 });
  const [sound, setSound] = useState(false);
  const [shownAt, setShownAt] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const recorded = useRef(false);
  const question = quest[round];
  const level = levelFor(xp);

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(QUEST_STORAGE_NAME) || "null");
      if (value && typeof value === "object" && "best" in value && "plays" in value && Number.isSafeInteger(value.best) && Number.isSafeInteger(value.plays)) setSaved(value as Saved);
      setSound(localStorage.getItem("cq_quest_sound") === "on");
    } catch { /* The game works without browser storage. */ }
    return () => { void audio.current?.close().catch(() => {}); };
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    setShownAt(performance.now());
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest(".quest-card")?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [phase, round]);

  useEffect(() => { if (feedback) nextButton.current?.focus({ preventScroll: true }); }, [feedback]);

  const profile = useMemo(() => interestProfile(tally), [tally]);
  const careers = useMemo(() => matchCareers(profile), [profile]);
  const routes = useMemo(() => matchRoutes(careers), [careers]);

  useEffect(() => {
    if (phase !== "results" || recorded.current) return;
    recorded.current = true;
    const next = { best: Math.max(saved.best, xp), plays: saved.plays + 1, top: profile[0]?.dim };
    setSaved(next);
    try { localStorage.setItem(QUEST_STORAGE_NAME, JSON.stringify(next)); } catch {}
    tone("win");
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function tone(kind: "pick" | "right" | "wrong" | "win", force = false) {
    if (!sound && !force) return;
    try {
      const context = audio.current || (audio.current = new AudioContext());
      void context.resume().catch(() => {});
      const notes = { pick: [523, 659], right: [659, 784, 1047], wrong: [330, 262], win: [523, 659, 784, 1047, 1319] }[kind];
      notes.forEach((frequency, i) => {
        const oscillator = context.createOscillator(), gain = context.createGain(), time = context.currentTime + i * .09;
        oscillator.type = kind === "wrong" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(.05, time + .01);
        gain.gain.exponentialRampToValueAtTime(.001, time + .2);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(time); oscillator.stop(time + .21);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Sound is optional. */ }
  }

  function start() {
    setQuest(buildQuest()); setRound(0); setXp(0); setStreak(0); setBestStreak(0);
    setKnowledge({ right: 0, total: 0 }); setTally(emptyTally()); setCards([]);
    setChosen(null); setFeedback(null); recorded.current = false; setPhase("play");
  }

  function answerInterest(options: InterestOption[], index: number) {
    const option = options[index];
    setTally((current) => {
      const next = { ...current };
      options.forEach((o) => { next[o.dim] = { ...next[o.dim], offered: next[o.dim].offered + 1 }; });
      next[option.dim] = { ...next[option.dim], picked: next[option.dim].picked + 1 };
      return next;
    });
    const fast = question.kind === "versus" && performance.now() - shownAt < SPEED_SECONDS * 1000;
    const gain = 10 + (fast ? 5 : 0);
    const newCard = !cards.includes(option.career);
    if (newCard) setCards((current) => [...current, option.career]);
    setXp((value) => value + gain);
    setFeedback({ correct: null, title: fast ? "Gut instinct! +5 speed bonus" : `${DIMENSIONS[option.dim].emoji} ${DIMENSIONS[option.dim].short} move`, body: option.reveal, xp: gain, card: newCard ? option.career : undefined });
    tone("pick");
  }

  function answerKnowledge(correct: boolean, explain: string) {
    const nextStreak = correct ? streak + 1 : 0;
    const gain = correct ? 20 + Math.min(streak, 3) * 5 : 5;
    setStreak(nextStreak); setBestStreak((best) => Math.max(best, nextStreak));
    setKnowledge((k) => ({ right: k.right + (correct ? 1 : 0), total: k.total + 1 }));
    setXp((value) => value + gain);
    setFeedback({ correct, title: correct ? (nextStreak > 1 ? `Correct! 🔥 ${nextStreak} in a row` : "Correct!") : "Not quite. Now you know!", body: explain, xp: gain });
    tone(correct ? "right" : "wrong");
  }

  function choose(index: number) {
    if (!question || feedback) return;
    setChosen(index);
    if (question.kind === "scenario" || question.kind === "versus") answerInterest(question.options, index);
    else if (question.kind === "myth") answerKnowledge((index === 0) === question.answer, question.explain);
    else answerKnowledge(index === question.answer, question.explain);
  }

  function next() {
    setChosen(null); setFeedback(null);
    if (round + 1 >= quest.length) setPhase("results"); else setRound(round + 1);
  }

  function toggleSound() {
    const value = !sound; setSound(value);
    try { localStorage.setItem("cq_quest_sound", value ? "on" : "off"); } catch {}
    if (value) tone("pick", true);
  }

  const header = <header className="quest-header">
    <div><p className="quest-kicker">Career Quest</p><h1>{phase === "results" ? "Your career map" : "Find work you’d actually enjoy"}</h1></div>
    <button type="button" className="quest-sound" aria-pressed={sound} onClick={toggleSound}>{sound ? "🔊" : "🔈"} Sound {sound ? "on" : "off"}</button>
  </header>;

  if (phase === "intro") {
    const last = saved.top ? roles[saved.top] : null;
    return <section className={`quest ${tanker.variable}`} aria-labelledby="quest-title">
      {header}
      <div className="quest-intro">
        <div className="quest-intro-copy">
          <Bolt mood="happy" />
          <h2 id="quest-title" tabIndex={-1} ref={heading}>12 quick rounds. Real careers. A plan at the end.</h2>
          <p>Answer honestly. Interest rounds have no wrong answers. Myth and mystery rounds teach you how routes after 10th really work.</p>
          <ul className="quest-modes">
            <li><span>🤔</span><strong>What would you do?</strong>Everyday situations that show what you enjoy</li>
            <li><span>⚡</span><strong>This or that</strong>Go with your gut. Fast answers earn a bonus</li>
            <li><span>🧐</span><strong>Myth or fact?</strong>Bust the rumours about streams and careers</li>
            <li><span>🕵️</span><strong>Who am I?</strong>Guess the career from the clues</li>
          </ul>
          <button className="quest-primary" onClick={start}>Start the quest <span aria-hidden="true">→</span></button>
          {saved.plays > 0 && <p className="quest-last">Played {saved.plays} {saved.plays === 1 ? "time" : "times"} · best {saved.best} XP{last ? ` · last result: ${last.title}` : ""}</p>}
        </div>
        <div className="quest-intro-prize" aria-hidden="true">
          <p>At the end you get</p>
          <span>🧭 Your interest profile</span><span>💼 4 careers that fit you</span><span>🛣️ Routes after 10th to explore</span><span>✅ 2 things to try this week</span>
        </div>
      </div>
      <footer className="quest-footer"><p>Just for fun and reflection. It never changes your marks or college matches.</p><button className="quest-quiet" onClick={onContinue}>Skip to the story mission →</button></footer>
    </section>;
  }

  if (phase === "results") {
    const top = profile[0].dim, second = profile[1].dim;
    const ask = `My Career Quest result: strongest interests ${DIMENSIONS[top].name} and ${DIMENSIONS[second].name}. Matching careers: ${careers.map((c) => c.career.name).join(", ")}. Which route after 10th should I explore first, and why?`;
    return <section className={`quest quest-results ${tanker.variable}`} aria-labelledby="quest-result-title">
      {header}
      <div className="quest-hero" style={{ "--dim": DIMENSIONS[top].color } as CSSProperties}>
        <Bolt mood="happy" />
        <div>
          <p className="quest-kicker">You play like</p>
          <h2 id="quest-result-title" tabIndex={-1} ref={heading}>{roles[top].title}</h2>
          <p>{roles[top].line}</p>
          <p className="quest-side">With a side of <strong>{roles[second].title}</strong>.</p>
        </div>
        <dl className="quest-score">
          <div><dt>XP</dt><dd>{xp}</dd></div>
          <div><dt>Level</dt><dd>{level.name}</dd></div>
          <div><dt>Myths busted</dt><dd>{knowledge.right}/{knowledge.total}</dd></div>
          <div><dt>Best streak</dt><dd>🔥 {bestStreak}</dd></div>
        </dl>
      </div>

      <div className="quest-results-grid">
        <section className="quest-panel" aria-labelledby="quest-profile-title">
          <h3 id="quest-profile-title">Your interest profile</h3>
          <ul className="quest-bars">{profile.map(({ dim, fit }) => <li key={dim}>
            <span>{DIMENSIONS[dim].emoji} {DIMENSIONS[dim].name}</span>
            <div className="quest-bar" role="img" aria-label={`${DIMENSIONS[dim].name}: picked ${tally[dim].picked} of ${tally[dim].offered} times`}><i style={{ width: `${Math.round(fit * 100)}%`, background: DIMENSIONS[dim].color }} /></div>
            <b>{tally[dim].picked}/{tally[dim].offered}</b>
          </li>)}</ul>
          <p className="quest-note">How often you chose each kind of activity when it was on offer.</p>
        </section>

        <section className="quest-panel" aria-labelledby="quest-routes-title">
          <h3 id="quest-routes-title">Routes after 10th to explore first</h3>
          <ol className="quest-routes">{routes.map((r) => <li key={r.id}>
            <Link href={"/explore/" + r.id}><strong>{route(r.id)?.name || r.id}</strong><span>Leads to {[...new Set(r.careers)].slice(0, 3).join(", ")}</span></Link>
          </li>)}</ol>
          <p className="quest-note">Every route stays open. These are where your picks point today.</p>
        </section>
      </div>

      <section aria-labelledby="quest-careers-title">
        <h3 id="quest-careers-title" className="quest-section-title">💼 Careers that fit how you played</h3>
        <div className="quest-careers">{careers.map(({ career }) => <article key={career.name} className="quest-career">
          <header><span aria-hidden="true">{career.emoji}</span><h4>{career.name}</h4></header>
          <p>{career.does}</p>
          <dl>
            <div><dt>After 10th</dt><dd>{career.routes.map((id) => route(id)?.short || id).join(" · ")}</dd></div>
            <div><dt>Study path</dt><dd>{career.study}</dd></div>
            {career.exams.length > 0 && <div><dt>Exams to know</dt><dd>{career.exams.join(", ")}</dd></div>}
            <div><dt>Subjects to enjoy</dt><dd>{career.subjects.join(", ")}</dd></div>
          </dl>
          <div className="quest-tags">{career.dims.map((dim) => <span key={dim} style={{ color: DIMENSIONS[dim].color }}>{DIMENSIONS[dim].emoji} {DIMENSIONS[dim].short}</span>)}</div>
        </article>)}</div>
      </section>

      <div className="quest-results-grid">
        <section className="quest-panel" aria-labelledby="quest-try-title">
          <h3 id="quest-try-title">✅ Test it in real life this week</h3>
          <ul className="quest-try">{[EXPERIMENTS[top][0], EXPERIMENTS[second][0]].map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="quest-note">Enjoying it for real is better evidence than any quiz.</p>
        </section>
        <section className="quest-panel" aria-labelledby="quest-deck-title">
          <h3 id="quest-deck-title">🃏 Career cards you unlocked ({cards.length})</h3>
          <ul className="quest-deck">{cards.map((name) => <li key={name}>{CAREERS.find((c) => c.name === name)?.emoji} {name}</li>)}</ul>
        </section>
      </div>

      <div className="quest-actions">
        <Link className="quest-primary" href={"/mentor?q=" + encodeURIComponent(ask)}>Talk it through with Kompas <span aria-hidden="true">→</span></Link>
        <button className="quest-secondary" onClick={onContinue}>Save it to my Compass: play the story mission</button>
        <button className="quest-quiet" onClick={start}>↻ Play again with new questions</button>
      </div>
      <p className="quest-footnote">A snapshot of one game, not a label for life. Talk it over with a parent, teacher or counsellor before deciding.</p>
    </section>;
  }

  if (!question) return null;
  const isInterest = question.kind === "scenario" || question.kind === "versus";
  const options = isInterest ? question.options.map((opt) => ({ emoji: opt.emoji, text: opt.text })) : question.kind === "myth" ? [{ emoji: "✅", text: "Fact" }, { emoji: "❌", text: "Myth" }] : question.options.map((text) => ({ emoji: "", text }));
  const correctIndex = question.kind === "myth" ? (question.answer ? 0 : 1) : question.kind === "guess" ? question.answer : -1;
  const prompt = question.kind === "scenario" || question.kind === "versus" ? question.prompt : question.kind === "myth" ? question.statement : question.clue;

  return <section className={`quest ${tanker.variable}`} aria-labelledby="quest-question">
    {header}
    <div className="quest-hud" aria-label="Quest progress">
      <div className="quest-rounds" role="progressbar" aria-label="Round" aria-valuemin={1} aria-valuemax={quest.length} aria-valuenow={round + 1} aria-valuetext={`Round ${round + 1} of ${quest.length}`}>
        {quest.map((_, i) => <span key={i} className={i < round ? "done" : i === round ? "current" : ""} />)}
      </div>
      <div className="quest-stats">
        <span data-testid="quest-xp"><b>{xp}</b> XP</span>
        <span className={streak > 1 ? "hot" : ""}>🔥 <b>{streak}</b></span>
        <span className="quest-level">{level.name}<i style={{ width: `${Math.round(level.progress * 100)}%` }} /></span>
      </div>
    </div>

    <div className={`quest-card quest-kind-${question.kind}`} key={question.id}>
      <div className="quest-card-top">
        <span className="quest-badge">{KIND_LABEL[question.kind]}</span>
        <span className="quest-round">Round {round + 1} of {quest.length}</span>
      </div>
      {question.kind === "versus" && !feedback && <div className="quest-timer" aria-hidden="true"><i style={{ animationDuration: `${SPEED_SECONDS}s` }} /></div>}
      <div className="quest-prompt">
        {question.kind === "scenario" ? <span className="quest-emoji" aria-hidden="true">{question.emoji}</span> : <Bolt mood={feedback ? "happy" : "idle"} />}
        <h2 id="quest-question" tabIndex={-1} ref={heading}>{question.kind === "guess" && <small>Clue: </small>}{prompt}</h2>
      </div>
      <div className={`quest-options quest-options-${options.length}`} role="group" aria-label="Answers">
        {options.map((opt, i) => {
          const state = feedback ? (i === chosen ? (correctIndex === -1 || i === correctIndex ? "picked" : "wrong") : i === correctIndex ? "right" : "faded") : "";
          return <button key={opt.text} className={`quest-option ${state}`} disabled={Boolean(feedback)} aria-pressed={chosen === i} onClick={() => choose(i)}>
            {opt.emoji && <span aria-hidden="true">{opt.emoji}</span>}<strong>{opt.text}</strong>
          </button>;
        })}
      </div>
      <div className="quest-feedback-slot" aria-live="polite">
        {feedback && <div className={`quest-feedback ${feedback.correct === false ? "miss" : "hit"}`}>
          <div><strong>{feedback.title}</strong><span className="quest-xp-pop">+{feedback.xp} XP</span></div>
          <p>{feedback.body}</p>
          {feedback.card && <p className="quest-unlock">🃏 Career card unlocked: <b>{feedback.card}</b></p>}
          <button ref={nextButton} className="quest-primary" onClick={next}>{round + 1 >= quest.length ? "See my career map" : "Next round"} <span aria-hidden="true">→</span></button>
        </div>}
      </div>
    </div>
    <footer className="quest-footer"><p>{isInterest ? "No wrong answers here. Pick what you’d honestly enjoy." : "Knowledge round: every answer teaches you something."}</p><button className="quest-quiet" onClick={() => setPhase("intro")}>Quit quest</button></footer>
  </section>;
}
