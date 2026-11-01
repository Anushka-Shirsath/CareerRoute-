"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import localFont from "next/font/local";
import { AttractionArt, FestivalMap, VisitorArt } from "./festival-art";
import {
  BOOTHS, CHALLENGES, COMBOS, MAX_BOOTHS, MAX_GREETINGS, FESTIVAL_RECORD_STORAGE_NAME,
  RUSH_SECONDS, THEMES, canAddBooth, scoreFestival, type BoothId,
} from "./festival-rules";

const tanker = localFont({ src: "../../public/fonts/tanker-regular.woff2", variable: "--festival-display", display: "swap" });
type Phase = "ready" | "build" | "rush" | "results";
type FestivalRecord = { best: number; festivals: number };
const emptyRecord: FestivalRecord = { best: 0, festivals: 0 };
const visitorLines = ["Is this the robot queue?", "I only came for snacks.", "My aunty sent me.", "Is there free wifi?", "I heard there is a dance-off!"];
const visitorPositions = [{ x: 22, y: 53 }, { x: 69, y: 62 }, { x: 44, y: 42 }, { x: 21, y: 64 }, { x: 74, y: 36 }];

function Coin() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#E9BF67" /><circle cx="12" cy="12" r="6" fill="none" stroke="#9C6B36" strokeWidth="1.5" /><path d="m12 8 1.2 2.5 2.8.4-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4Z" fill="#9C6B36" /></svg>;
}

function FestivalPrize() {
  return <svg viewBox="0 0 40 44" aria-hidden="true"><path d="m11 25-3 16 9-5 6 5 3-16" fill="#C17554" /><path d="m20 1 5 5 7-1 1 7 5 5-5 5-1 7-7-1-5 5-5-5-7 1-1-7-5-5 5-5 1-7 7 1Z" fill="#DBB55E" /><circle cx="20" cy="17" r="9" fill="#F3D58F" /><path d="m20 10 2 4.2 4.6.7-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.7Z" fill="#9B7038" /></svg>;
}

export function FestivalHunt({ onContinue }: { onContinue: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [day, setDay] = useState(0);
  const [edition, setEdition] = useState(0);
  const [selected, setSelected] = useState<BoothId[]>([]);
  const [greeted, setGreeted] = useState(0);
  const [seconds, setSeconds] = useState(RUSH_SECONDS);
  const [record, setRecord] = useState<FestivalRecord>(emptyRecord);
  const [stars, setStars] = useState<number[]>([]);
  const [newBest, setNewBest] = useState(false);
  const [sound, setSound] = useState(false);
  const [announcement, setAnnouncement] = useState("Your festival starts with an idea. Ready to build it?");
  const audio = useRef<AudioContext | null>(null);
  const recorded = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const visitorButton = useRef<HTMLButtonElement>(null);
  const mapScene = useRef<HTMLDivElement>(null);
  const challenge = CHALLENGES[day];
  const theme = THEMES[(THEMES.indexOf(challenge.featured) + edition) % THEMES.length];
  const score = scoreFestival(selected, theme);
  const visitors = score.total + greeted * 2;
  const balance = challenge.budget - score.spent;
  const won = visitors >= challenge.goal;
  const earnedStars = won ? (visitors >= challenge.goal + 6 ? 3 : 2) : 1;
  const open = phase === "rush" || phase === "results";

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(FESTIVAL_RECORD_STORAGE_NAME) || "null");
      if (saved && typeof saved === "object" && "best" in saved && "festivals" in saved &&
        Number.isSafeInteger(saved.best) && Number.isSafeInteger(saved.festivals) &&
        Number(saved.best) >= 0 && Number(saved.best) <= 100 && Number(saved.festivals) >= 0) setRecord(saved as FestivalRecord);
      setSound(localStorage.getItem("cq_festival_sound") === "on");
    } catch { /* The game also works when browser storage is unavailable. */ }
    return () => { void audio.current?.close().catch(() => {}); };
  }, []);

  function playTone(kind: "build" | "welcome" | "win", force = false) {
    if (!sound && !force) return;
    try {
      const context = audio.current || (audio.current = new AudioContext());
      void context.resume().catch(() => {});
      const notes = kind === "win" ? [523, 659, 784, 1047] : kind === "welcome" ? [659, 988] : [330, 440];
      notes.forEach((frequency, i) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const time = context.currentTime + i * .085;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(.055, time + .01);
        gain.gain.exponentialRampToValueAtTime(.001, time + .19);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(time); oscillator.stop(time + .2);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Sound is an optional extra. */ }
  }

  useEffect(() => {
    if (phase !== "rush") return;
    mapScene.current?.scrollIntoView({ block: "center", behavior: "instant" });
    visitorButton.current?.focus({ preventScroll: true });
    const timer = setInterval(() => { if (!document.hidden) setSeconds((remaining) => Math.max(0, remaining - 1)); }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "rush" && (seconds === 0 || greeted === MAX_GREETINGS)) setPhase("results");
  }, [phase, seconds, greeted]);

  useEffect(() => {
    if (phase !== "results" || recorded.current) return;
    recorded.current = true;
    const next = { best: Math.max(record.best, visitors), festivals: record.festivals + 1 };
    setNewBest(visitors > record.best); setRecord(next);
    setStars((previous) => { const next = [...previous]; next[day] = Math.max(previous[day] || 0, earnedStars); return next; });
    try { localStorage.setItem(FESTIVAL_RECORD_STORAGE_NAME, JSON.stringify(next)); } catch {}
    setAnnouncement(`${won ? "Festival success!" : "The town had a lovely day!"} ${visitors} visitors. ${earnedStars} of 3 stars.`);
    playTone("win");
    resultHeading.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 720px)").matches) {
      resultHeading.current?.closest("aside")?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [phase, visitors, day, earnedStars, won, record]);

  function reset(nextDay: number, nextEdition = edition) {
    setDay(nextDay); setEdition(nextEdition); setSelected([]); setGreeted(0);
    setSeconds(RUSH_SECONDS); setNewBest(false); recorded.current = false; setPhase("build");
    setAnnouncement(`Day ${nextDay + 1}. Choose your attractions, then open the gates.`);
  }

  function choose(id: BoothId) {
    if (phase !== "build") return;
    const booth = BOOTHS.find((item) => item.id === id)!;
    if (selected.includes(id)) {
      setSelected((items) => items.filter((item) => item !== id));
      setAnnouncement(`${booth.name} removed. ${booth.cost} tokens returned.`); return;
    }
    if (!canAddBooth(selected, id, challenge.budget)) return;
    const next = [...selected, id], nextScore = scoreFestival(next, theme);
    const unlocked = nextScore.combos.find((combo) => !score.combos.includes(combo));
    setSelected(next);
    setAnnouncement(unlocked ? `${unlocked.name} combo! 5 extra visitors. ${booth.name} is built.` : `${booth.name} is built! ${nextScore.total} visitors expected.`);
    playTone("build");
  }

  function launch() {
    if (phase !== "build" || !selected.length) return;
    setPhase("rush");
    setAnnouncement("The gates are open! Select the five waving visitors on the map. Each welcome brings 2 extra visitors.");
    playTone("build");
  }

  function welcome(index: number) {
    if (phase !== "rush" || index !== greeted) return;
    setGreeted((count) => Math.min(MAX_GREETINGS, count + 1));
    setAnnouncement(`Visitor welcomed! ${greeted * 2 + 2} bonus visitors so far.`); playTone("welcome");
  }

  function toggleSound() {
    const next = !sound; setSound(next);
    try { localStorage.setItem("cq_festival_sound", next ? "on" : "off"); } catch {}
    if (next) playTone("welcome", true);
  }

  return <section className={`festival-game ${tanker.variable} festival-phase-${phase}`} aria-labelledby="festival-title">
    <header className="festival-header">
      <div className="festival-title-block"><h1 id="festival-title">Big Day <span>Festival</span></h1><p>Your town. Your lineup. Your kind of fun.</p></div>
      <div className="festival-tools">
        <button className="festival-sound" aria-pressed={sound} onClick={toggleSound}><span aria-hidden="true">{sound ? "♫" : "♪"}</span>Sound {sound ? "on" : "off"}</button>
        <details className="festival-help"><summary>How to play <span aria-hidden="true">?</span></summary><div><strong>A little planning. A big day out.</strong><p>Build up to 4 attractions within your token budget. Tap a built attraction again to remove it and get your tokens back.</p><p>Featured attractions bring 3 extra visitors each. Every different type brings 2. Complete a pair below for 5 more.</p><p>Open the gates when you’re ready. Welcome the 5 waving visitors for up to 10 bonus visitors in a 12-second crowd rush. Use Tab and Enter to welcome them by keyboard. The rush pauses when this tab is hidden.</p><p>Two stars for reaching the goal. Three for beating it by 6. Play all 3 days, or retry any day.</p></div></details>
      </div>
    </header>

    <div className="festival-stats" aria-label="Festival scoreboard">
      <div className="festival-stat"><Coin /><div><span>Tokens to spend</span><strong>{balance}<small> / {challenge.budget}</small></strong></div></div>
      <div className="festival-stat"><VisitorArt index={2} /><div><span>{open ? "Visitors welcomed" : "Expected visitors"}</span><strong data-testid="festival-score">{visitors}<small> / {challenge.goal}</small></strong></div></div>
      <div className="festival-stat"><AttractionArt id="arcade" /><div><span>Attractions built</span><strong>{selected.length}<small> / {MAX_BOOTHS}</small></strong></div></div>
      <div className="festival-stat festival-best"><FestivalPrize /><div><span>Personal best</span><strong>{record.best}<small>{record.best ? " visitors" : " set the record"}</small></strong></div></div>
    </div>

    <div className="festival-play-area">
      <div className="festival-map-panel">
        <div className="festival-map-caption"><span><strong>Your festival grounds</strong><span>{phase === "rush" ? "The crowd is here. Say hello!" : open ? "A little town, a lot of happy people." : "A blank field. Endless possibilities."}</span></span><span className="festival-weather"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Perfect festival weather</span></div>
        <div className="festival-map-scene" ref={mapScene}>
          <FestivalMap selected={selected} open={open} />
          {phase === "ready" && <div className="festival-start-sign"><span className="festival-sign-star" aria-hidden="true">✷</span><strong>Good times<br />start here.</strong><p>12 tokens. 4 plots. One big idea.</p><button className="festival-primary" onClick={() => reset(0)}>Let’s build a festival <span aria-hidden="true">↗</span></button><span className="festival-start-note">Three little challenges. No pressure.</span></div>}
          {phase === "rush" && <>
            <div className="festival-rush-clock"><strong>{seconds}s</strong><span>Crowd rush</span></div>
            <button ref={visitorButton} className="festival-visitor" onClick={() => welcome(greeted)} style={{ left: `${visitorPositions[Math.min(greeted, 4)].x}%`, top: `${visitorPositions[Math.min(greeted, 4)].y}%` }} aria-label={`Welcome visitor ${Math.min(greeted + 1, 5)} of 5, plus 2 visitors`}><span>{visitorLines[Math.min(greeted, 4)]} <b>+2</b></span><VisitorArt index={greeted} /></button>
          </>}
          {phase === "results" && <div className="festival-confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--i": i, left: `${4 + (i * 17) % 91}%`, backgroundColor: ["#D88263", "#D5AD50", "#709E86", "#B67F98"][i % 4] } as CSSProperties} />)}</div>}
          {phase === "build" && <div className="festival-map-tip">{selected.length === 0 ? "Pick your first attraction below ↓" : selected.length === 4 ? "Your lineup is ready. Open the gates!" : `${4 - selected.length} open plots. What’s next?`}</div>}
          {phase === "rush" && <div className="festival-welcome-track" aria-label={`${greeted} of 5 visitors welcomed`}>{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < greeted ? "welcomed" : ""}>{i < greeted ? "✓" : i + 1}</span>)}<b>+{greeted * 2} visitors</b></div>}
        </div>
        <div className="festival-feedback" role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">{phase === "results" ? "✷" : "☞"}</span>{announcement}</div>
      </div>

      <aside className="festival-director" aria-label="Festival challenge">
        <div className="festival-day-row"><span>Day {day + 1} of 3</span><div aria-label={`${stars.reduce((sum, star) => sum + star, 0)} stars earned`}>{[0, 1, 2].map((value) => <span key={value} className={value === day ? "current" : value < day ? "complete" : ""}>{value < day ? "✓" : value + 1}</span>)}</div></div>
        {phase === "results" ? <div className="festival-result" data-testid="festival-result">
          <div className="festival-result-stars" aria-label={`${earnedStars} of 3 stars`}>{[1, 2, 3].map((value) => <span key={value} className={value <= earnedStars ? "earned" : ""}>★</span>)}</div>
          <h2 ref={resultHeading} tabIndex={-1}>{won ? "What a big day!" : "A good start!"}</h2>
          <p>{won ? "You brought the town together." : "Try a featured booth or a pair bonus to bring a bigger crowd."}</p>
          <div className="festival-result-number">{visitors}<span>happy visitors</span></div>
          {newBest && <p className="festival-new-best">A new personal best. Nicely done!</p>}
          <div className="festival-jobs"><h3>Behind your booths: real jobs</h3><ul>{BOOTHS.filter((booth) => selected.includes(booth.id)).map((booth) => <li key={booth.id}><strong>{booth.name}</strong>{booth.job}</li>)}</ul></div>
        </div> : <div className="festival-challenge-copy"><h2>{challenge.name}</h2><p>{challenge.description}</p><div className="festival-goal"><strong>{challenge.goal}</strong><span>visitors to<br />make the day</span></div></div>}

        <div className="festival-goal-progress"><div className="festival-meter" role="progressbar" aria-label="Visitor goal" aria-valuemin={0} aria-valuemax={challenge.goal} aria-valuenow={Math.min(visitors, challenge.goal)} aria-valuetext={`${visitors} of ${challenge.goal} visitors`}><span style={{ width: `${Math.min(100, visitors / challenge.goal * 100)}%` }} /></div><span>{visitors >= challenge.goal ? "Goal reached. Keep the good times coming!" : `${challenge.goal - visitors} more visitors to your goal`}</span></div>

        {!open && <div className="festival-featured"><span className="festival-featured-flower" aria-hidden="true">✺</span><p>In the spotlight<strong>{theme} attractions</strong><span>+3 visitors for each one you build</span></p></div>}

        {phase === "results" ? <dl className="festival-breakdown"><div><dt>Your attractions</dt><dd>{score.base}</dd></div><div><dt>Featured theme</dt><dd>+{score.featured}</dd></div><div><dt>Variety bonus</dt><dd>+{score.variety}</dd></div><div><dt>Pair bonuses</dt><dd>+{score.combos.length * 5}</dd></div><div><dt>Crowd rush</dt><dd>+{greeted * 2}</dd></div></dl> : <div className="festival-pair-list"><h3>A good pair makes a great day</h3>{COMBOS.map((combo) => {
          const unlocked = score.combos.includes(combo);
          return <div key={combo.name} className={unlocked ? "festival-pair unlocked" : "festival-pair"}><span className="festival-pair-mark" aria-hidden="true">{unlocked ? "✓" : "⊹"}</span><div><strong>{combo.name}</strong><span>{combo.detail}</span></div><b>+5</b></div>;
        })}</div>}

        <div className="festival-director-actions">
          {phase === "ready" && <p className="festival-director-note">You’re the director. Make something worth showing up for.</p>}
          {phase === "build" && <><button className="festival-primary" disabled={!selected.length} onClick={launch}>Open the gates <span aria-hidden="true">↗</span></button><p>Happy with your lineup? Let them in.</p></>}
          {phase === "rush" && <><strong>Welcome the waving visitors!</strong><p>Tap them on the map. Each hello brings 2 more people.</p><button className="festival-quiet-button" onClick={() => setPhase("results")}>Finish without more bonus</button></>}
          {phase === "results" && <>
            <button className="festival-primary" onClick={() => { if (day < 2) reset(day + 1); else { setStars([]); reset(0, edition + 1); } }}>{day < 2 ? `On to day ${day + 2}` : "Play a new festival"}<span aria-hidden="true">↗</span></button>
            <button className="festival-quiet-button" onClick={() => reset(day)}>↻ Try this day again</button>
            {day === 2 && <p className="festival-campaign-result">Festival complete: {stars.reduce((sum, star) => sum + star, 0)} of 9 stars!</p>}
          </>}
        </div>
      </aside>
    </div>

    <div className="festival-build-menu">
      <div className="festival-build-heading"><h2>Pick your good times.</h2><p>{phase === "build" ? "Tap to build. Tap again to change your mind." : open ? "Your lineup made this day happen." : "Meet your future crowd-pleasers."}</p></div>
      <div className="festival-board" role="group" aria-label="Festival attractions">
        {BOOTHS.map((booth) => {
          const chosen = selected.includes(booth.id), available = canAddBooth(selected, booth.id, challenge.budget);
          return <button key={booth.id} className={`festival-cell festival-attraction-${booth.color}${chosen ? " revealed" : ""}`} disabled={phase !== "build" || (!chosen && !available)} aria-pressed={chosen} onClick={() => choose(booth.id)} aria-label={`${chosen ? "Remove" : "Build"} ${booth.name}, ${booth.type}, costs ${booth.cost} tokens, attracts ${booth.visitors + (booth.type === theme ? 3 : 0)} visitors${chosen ? ", built" : ""}`}>
            <div className="festival-attraction-art"><AttractionArt id={booth.id} /><span className="festival-build-status">{chosen ? "✓ Built" : phase === "build" && !available ? (selected.length === 4 ? "All plots full" : "Need more tokens") : booth.type === theme ? "+3 featured" : booth.type}</span></div>
            <div className="festival-attraction-info"><strong>{booth.name}</strong><span>{booth.detail}</span><div className="festival-attraction-cost"><span><Coin />{booth.cost}<span className="festival-cost-unit"> tokens</span></span><b>+{booth.visitors + (booth.type === theme ? 3 : 0)}<span> visitors</span></b></div></div>
          </button>;
        })}
      </div>
    </div>

    <footer className="festival-footer"><p>Just for the joy of it. Game scores don’t affect your career suggestions.</p><button className="festival-skip" onClick={onContinue}>Continue to the career adventure <span aria-hidden="true">↗</span></button></footer>
  </section>;
}
