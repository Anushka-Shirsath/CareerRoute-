"use client";
import type { PathwayId } from "../types";

// Light-hearted story layer for the Compass mission. None of this changes
// scoring: it only reacts to choices and shows the real work behind them.

export type Dimension = "AN" | "PM" | "CR" | "EN" | "SO";

export const roles: Record<
  Dimension,
  { title: string; line: string; jobs: string[]; routes: PathwayId[] }
> = {
  AN: {
    title: "The Why Detective",
    line: "You can't leave a mystery alone. Broken model? Strange number? You need to know why.",
    jobs: ["Lab technician", "Data analyst", "Doctor", "Forensic scientist", "Software tester"],
    routes: ["fyjc_science", "polytechnic_diploma"],
  },
  PM: {
    title: "The Fixer",
    line: "Give you a screwdriver and ten minutes. Things that were broken start working again.",
    jobs: ["Electrician", "Mechanical technician", "Civil site engineer", "Mobile repair expert", "Robotics technician"],
    routes: ["polytechnic_diploma", "iti_trade", "vocational"],
  },
  CR: {
    title: "The Spark",
    line: "Where others see a plain wall, you see a mural, a logo and a short video.",
    jobs: ["Graphic designer", "Animator", "Architect", "Fashion designer", "Content creator"],
    routes: ["fyjc_arts", "vocational"],
  },
  EN: {
    title: "The Deal Maker",
    line: "You checked the budget before anyone checked the glue. The stall made a profit.",
    jobs: ["Entrepreneur", "Chartered accountant", "Marketing manager", "Event planner", "Bank officer"],
    routes: ["fyjc_commerce", "vocational"],
  },
  SO: {
    title: "The Glue",
    line: "When the team argued, you were the one everybody listened to.",
    jobs: ["Teacher", "Nurse", "Counsellor", "Social worker", "Hotel and hospitality manager"],
    routes: ["fyjc_arts", "fyjc_science"],
  },
};

// Bolt, the festival robot, reacts to every choice. Two lines per dimension,
// picked by option id so the same choice always gets the same joke.
const reactions: Record<Dimension, string[]> = {
  AN: [
    "You squint at it like a TV detective. Somebody cue the dramatic music.",
    "Bolt is impressed. Bolt has also never once read the rules.",
  ],
  PM: [
    "You pick up the screwdriver like it is a sword. Bolt salutes you.",
    "Bolt's left arm has been loose since last year. Bolt is hopeful.",
  ],
  CR: [
    "That sketch is so good the art teacher asks if it was printed.",
    "Bolt wants a poster of itself now. A dramatic one. With lightning.",
  ],
  EN: [
    "A spreadsheet already? Bolt is equal parts scared and impressed.",
    "The canteen uncle wants to hire you as his manager.",
  ],
  SO: [
    "Three teammates now have you saved as their emergency contact.",
    "You calmed everyone down. Even Bolt stopped beeping nervously.",
  ],
};

const peeks: Record<Dimension, string> = {
  AN: "Lab technicians, doctors and data analysts do this every single day.",
  PM: "Electricians, technicians and site engineers get paid to do exactly this.",
  CR: "Designers, architects and animators turn this into a full-time job.",
  EN: "Entrepreneurs, accountants and event planners live in this moment.",
  SO: "Teachers, nurses and counsellors are brilliant at this.",
};

export function topDimension(tags?: Record<string, number>): Dimension | null {
  const entries = Object.entries(tags || {}).filter(([, w]) => w > 0);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0] as Dimension;
}

export function reactionFor(optionId: string, tags?: Record<string, number>) {
  const dimension = topDimension(tags);
  if (!dimension) return null;
  const lines = reactions[dimension];
  const pick = [...optionId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % lines.length;
  return { dimension, line: lines[pick], peek: peeks[dimension] };
}

// A short scene title for each moment, so the mission reads like a story.
export const scenes: Record<string, string> = {
  S1: "4 days to go",
  S2: "The night before",
  S3: "Money trouble",
  R1: "Quick check-in",
  S4: "Festival day, 11 am",
  S5: "Festival day, 2 pm",
  MT: "Side quest",
  MT_RATE: "Side quest review",
  S6: "One week later",
  V1: "The big question",
};

// What Bolt says before a choice is made.
export const intros: Record<string, string> = {
  S1: "Hi, I'm Bolt, the festival robot. I was built last year and I'm still a bit wobbly. Please help.",
  S2: "Bad news. I may have sat on the model. It was an accident. Mostly.",
  S3: "The shopkeeper laughed at our budget. Not a polite laugh.",
  R1: "Be honest. Which of those would you happily do again?",
  S4: "People keep staring at our stall like it is a maths exam.",
  S5: "Two teammates are arguing and I have run out of calming beeps.",
  MT: "Side quest unlocked. No timer. No marks. Just try it.",
  MT_RATE: "So, was that fun or was that a chore? Both answers are useful.",
  S6: "We survived! The principal wants you back next year.",
  V1: "Last one. Forget the festival. What do you actually want?",
};

export function Bolt({ mood }: { mood: "idle" | "happy" }) {
  return (
    <svg className={"bolt bolt-" + mood} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="4" x2="32" y2="13" stroke="#20242c" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="bolt-antenna" cx="32" cy="5" r="4" fill="#e3765a" />
      <rect x="10" y="13" width="44" height="36" rx="12" fill="#c9eee1" stroke="#20242c" strokeWidth="2.5" />
      <rect x="4" y="25" width="6" height="12" rx="3" fill="#20242c" />
      <rect x="54" y="25" width="6" height="12" rx="3" fill="#20242c" />
      {mood === "happy" ? (
        <>
          <path d="M20 29q4-5 8 0M36 29q4-5 8 0" stroke="#20242c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M23 37q9 8 18 0" stroke="#20242c" strokeWidth="2.5" fill="#fff" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle className="bolt-eye" cx="24" cy="29" r="3.5" fill="#20242c" />
          <circle className="bolt-eye" cx="40" cy="29" r="3.5" fill="#20242c" />
          <path d="M26 39h12" stroke="#20242c" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      <rect x="20" y="51" width="24" height="9" rx="4" fill="#ffe694" stroke="#20242c" strokeWidth="2.5" />
    </svg>
  );
}
