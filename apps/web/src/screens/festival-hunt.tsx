"use client";
import { useState } from "react";

const booths = [
  { name: "Robot rally", type: "Make", cost: 4, visitors: 7, symbol: "✦", detail: "Build and race a tiny robot." },
  { name: "Mural wall", type: "Create", cost: 3, visitors: 5, symbol: "✺", detail: "Let visitors paint the festival." },
  { name: "Food lab", type: "Discover", cost: 3, visitors: 5, symbol: "◉", detail: "Invent a surprising snack." },
  { name: "Arcade tent", type: "Make", cost: 4, visitors: 8, symbol: "◆", detail: "Make a game visitors can play." },
  { name: "Music stage", type: "Create", cost: 2, visitors: 4, symbol: "♫", detail: "Give new performers a stage." },
  { name: "Green garden", type: "Discover", cost: 2, visitors: 3, symbol: "✿", detail: "Grow ideas for a greener city." },
] as const;
type Booth = typeof booths[number];
const themes = ["Make", "Create", "Discover"] as const;

export function FestivalHunt({ onContinue }: { onContinue: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Booth[]>([]);
  const [theme, setTheme] = useState<typeof themes[number]>("Make");
  const spent = selected.reduce((sum, booth) => sum + booth.cost, 0);
  const balance = 12 - spent;
  const variety = new Set(selected.map((b) => b.type)).size;
  const visitors = selected.reduce((sum, booth) => sum + booth.visitors + (booth.type === theme ? 3 : 0), 0) + variety * 2;
  const finished = playing && (selected.length === 4 || !booths.some((b) => !selected.includes(b) && b.cost <= balance));
  function start() { setSelected([]); setTheme(themes[Math.floor(Math.random() * themes.length)]); setPlaying(true); }
  function choose(booth: Booth) { if (playing && !finished && !selected.includes(booth) && booth.cost <= balance) setSelected([...selected, booth]); }
  return <section className="festival-game" aria-labelledby="festival-title">
    <div className="festival-intro">
      <div className="festival-tag">CAREER COMPASS · BONUS GAME</div>
      <h1 id="festival-title">Build the<br /><span>big day.</span></h1>
      <p>You are the festival director. Pick up to four booths with 12 tokens and attract 30 visitors. Each type you include earns 2 bonus visitors.</p>
      <div className="festival-stats"><span><strong>{balance}</strong> tokens left</span><span><strong>{visitors}</strong> visitors</span><span><strong>{selected.length} / 4</strong> booths</span></div>
      {!playing ? <button className="festival-primary" onClick={start}>Start the festival <span>↗</span></button> : <button className="festival-replay" onClick={start}>Start a new festival ↻</button>}
      <button className="festival-skip" onClick={onContinue}>Continue to the career adventure →</button>
      <p className="festival-note">Just for fun. Your game score does not affect your career suggestions.</p>
    </div>
    <div className="festival-board-wrap">
      <div className="festival-board-top"><div><strong>Choose your attractions</strong><span>{playing ? `Today's featured theme: ${theme}. Its booths bring 3 extra visitors!` : "Each booth has a cost and attracts visitors."}</span></div><span className="festival-ticket">GOAL: 30 VISITORS</span></div>
      <div className="festival-board" aria-label="Festival attractions">
        {booths.map((booth, i) => {
          const chosen = selected.includes(booth);
          return <button key={booth.name} className={'festival-cell festival-cell-' + (i % 4) + (chosen ? ' revealed' : '')} disabled={!playing || finished || chosen || booth.cost > balance} onClick={() => choose(booth)} aria-label={`${booth.name}, ${booth.type}, costs ${booth.cost} tokens, attracts ${booth.visitors} visitors${playing && booth.type === theme ? ', plus 3 featured visitors' : ''}${chosen ? ', selected' : ''}`}>
            <span className="festival-cell-icon" aria-hidden="true">{chosen ? '✓' : booth.symbol}</span><strong>{booth.name}</strong><span>{booth.detail}</span><span>{chosen ? 'Added!' : `${booth.cost} tokens · ${booth.visitors} visitors`}</span>
          </button>;
        })}
      </div>
      <div className="festival-feedback" role="status" aria-live="polite">{!playing ? 'Ready to run your own festival?' : finished ? `${visitors >= 30 ? 'Festival success!' : 'The gates are open!'} You welcomed ${visitors} visitors with ${selected.length} booths. Try another mix to beat your score.` : `${selected.length ? `${selected[selected.length - 1].name} is ready! ` : ''}Choose a booth. You have ${balance} tokens left.`}</div>
      {finished && <button className="festival-primary festival-continue" onClick={onContinue}>Continue your adventure →</button>}
    </div>
  </section>;
}
