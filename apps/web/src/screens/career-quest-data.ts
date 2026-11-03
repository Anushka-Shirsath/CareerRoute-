import type { PathwayId } from "../types";
import type { Dimension } from "./compass-fun";

// Career Quest: a replayable question game. Interest rounds ("scenario" and
// "versus") have no wrong answer and build the student's interest profile.
// Knowledge rounds ("myth" and "guess") teach real facts about careers and
// routes after 10th. Facts here are deliberately general and checkable:
// no salaries, cutoffs or admission chances.

export type InterestOption = { text: string; emoji: string; dim: Dimension; reveal: string; career: string };
export type ScenarioQuestion = { kind: "scenario"; id: string; emoji: string; prompt: string; options: InterestOption[] };
export type VersusQuestion = { kind: "versus"; id: string; prompt: string; options: [InterestOption, InterestOption] };
export type MythQuestion = { kind: "myth"; id: string; statement: string; answer: boolean; explain: string };
export type GuessQuestion = { kind: "guess"; id: string; clue: string; options: string[]; answer: number; explain: string };
export type Question = ScenarioQuestion | VersusQuestion | MythQuestion | GuessQuestion;

export const DIMENSIONS: Record<Dimension, { name: string; short: string; emoji: string; color: string }> = {
  AN: { name: "Analytical curiosity", short: "Thinker", emoji: "🔍", color: "#2f5bb8" },
  PM: { name: "Practical making", short: "Maker", emoji: "🔧", color: "#a3500f" },
  CR: { name: "Creative expression", short: "Creator", emoji: "🎨", color: "#a63d72" },
  EN: { name: "Enterprise & organising", short: "Leader", emoji: "🚀", color: "#7f5a00" },
  SO: { name: "Social & service", short: "Helper", emoji: "🤝", color: "#237050" },
};

const o = (emoji: string, text: string, dim: Dimension, career: string, reveal: string): InterestOption => ({ emoji, text, dim, career, reveal });

export const SCENARIOS: ScenarioQuestion[] = [
  { kind: "scenario", id: "bus", emoji: "🚌", prompt: "Your school trip bus breaks down on the highway. What do you do first?", options: [
    o("🔧", "Peek under the hood with the driver", "PM", "Automobile technician", "Automobile technicians track down breakdowns like this every day."),
    o("🗺️", "Work out the fastest new way to get there", "AN", "Data analyst", "Logistics and data analysts plan routes and timings for whole fleets."),
    o("🎤", "Start a sing-along so nobody panics", "SO", "Teacher", "Teachers and tour guides are experts at keeping a group calm and happy."),
    o("📞", "Phone around and arrange a replacement bus", "EN", "Event manager", "Operations and event managers solve problems like this for a living."),
  ] },
  { kind: "scenario", id: "app", emoji: "📱", prompt: "Your favourite app gets a terrible update. You…", options: [
    o("🎨", "Sketch how the screen should look", "CR", "Graphic or UI designer", "UI designers redesign screens so apps are easier and nicer to use."),
    o("🐞", "Figure out exactly what broke", "AN", "Software developer", "Software developers and testers hunt bugs before users find them."),
    o("📣", "Rally other users to demand the old version", "EN", "Marketing manager", "Product and marketing managers listen to users and decide what gets built."),
    o("👵", "Help your grandparents learn the new layout", "SO", "Teacher", "Trainers and support teams help people get comfortable with technology."),
  ] },
  { kind: "scenario", id: "fund", emoji: "🏫", prompt: "Your class gets ₹2,000 to improve the school. Your pitch?", options: [
    o("🌱", "A vegetable garden with drip watering", "PM", "Agriculture scientist", "Agriculture experts design watering systems for real farms."),
    o("🖼️", "A giant mural at the entrance", "CR", "Graphic or UI designer", "Muralists and illustrators are paid to transform walls."),
    o("📊", "Survey students first to find the biggest problem", "AN", "Data analyst", "Researchers and analysts always start with evidence."),
    o("🧁", "A bake sale to turn ₹2,000 into ₹6,000", "EN", "Entrepreneur", "Entrepreneurs grow money by selling something people want."),
  ] },
  { kind: "scenario", id: "rain", emoji: "🌧️", prompt: "Rainy holiday, stuck at home. Pick your vibe:", options: [
    o("🧩", "A 1,000-piece puzzle or a mystery novel", "AN", "Data analyst", "Patience with puzzles is the secret skill of scientists and analysts."),
    o("📻", "Open up the old radio to see how it works", "PM", "Robotics or electronics technician", "Electronics technicians make a career out of exactly this curiosity."),
    o("🎬", "Shoot a short film starring your family", "CR", "Animator or video editor", "Film-makers and editors started with home videos too."),
    o("🧒", "Teach your little cousin a new game", "SO", "Teacher", "Teachers live for the moment something finally clicks."),
  ] },
  { kind: "scenario", id: "festival", emoji: "🎪", prompt: "The school festival needs team leaders. You volunteer for…", options: [
    o("💡", "Lights and sound", "PM", "Electrician", "Sound and lighting technicians run every big concert."),
    o("🎟️", "Tickets and money", "EN", "Chartered Accountant", "Accountants and event managers make sure the numbers add up."),
    o("🎨", "Decorations and posters", "CR", "Graphic or UI designer", "Set designers and decorators create the look of events and films."),
    o("🩹", "First aid and the help desk", "SO", "Nurse", "Nurses and paramedics are the calm people in a crisis."),
  ] },
  { kind: "scenario", id: "puppy", emoji: "🐶", prompt: "A stray puppy limps into your colony. You…", options: [
    o("🩺", "Gently check where it is hurt", "SO", "Doctor", "Vets, doctors and nurses combine care with skill."),
    o("📣", "Get the neighbours to fund its treatment", "EN", "Social worker", "NGO founders and fundraisers turn kindness into action."),
    o("🏠", "Build it a shelter from old crates", "PM", "Civil engineer", "Carpenters and builders turn spare material into useful things."),
    o("🔍", "Read up on what might be wrong", "AN", "Doctor", "Every good doctor and researcher starts by finding out what is known."),
  ] },
  { kind: "scenario", id: "course", emoji: "🎓", prompt: "You win one free online course this summer. You pick…", options: [
    o("🤖", "Build your first robot", "PM", "Robotics or electronics technician", "Robotics technicians build, wire and program machines."),
    o("✏️", "Digital drawing and animation", "CR", "Animator or video editor", "Animators bring characters to life frame by frame."),
    o("💰", "How to start a small business", "EN", "Entrepreneur", "Many entrepreneurs started with one small idea and a notebook."),
    o("🧪", "Forensic science: solve a crime with evidence", "AN", "Pharmacist", "Forensic and lab scientists answer questions with evidence."),
  ] },
  { kind: "scenario", id: "fight", emoji: "🗣️", prompt: "Two friends are fighting and both want you on their side. You…", options: [
    o("🕊️", "Get them talking until they make up", "SO", "Psychologist or counsellor", "Counsellors help people work through conflicts."),
    o("🧠", "Work out how the misunderstanding started", "AN", "Lawyer", "Lawyers and investigators piece together what really happened."),
    o("😂", "Make a meme so silly they both laugh", "CR", "Journalist or content creator", "Content creators use humour to bring people together."),
    o("📅", "Plan an outing for the three of you", "EN", "Event manager", "Event planners create moments people remember."),
  ] },
  { kind: "scenario", id: "town", emoji: "🏗️", prompt: "Your town is building something new. What do you design?", options: [
    o("🌉", "A bridge that survives floods", "PM", "Civil engineer", "Civil engineers design and test bridges like this."),
    o("🏛️", "A library everyone wants to visit", "CR", "Architect", "Architects design spaces that make people feel something."),
    o("🏥", "A clinic that helps people quickly", "SO", "Nurse", "Doctors, nurses and health managers shape how clinics work."),
    o("🛍️", "A market where small shops thrive", "EN", "Entrepreneur", "Planners and business owners make markets buzz."),
  ] },
  { kind: "scenario", id: "night", emoji: "⏰", prompt: "It's 10 pm and something is keeping you awake. It's probably…", options: [
    o("❓", "A question you can't stop wondering about", "AN", "Data analyst", "Scientists turn those nagging questions into experiments."),
    o("💭", "An idea for a story, song or design", "CR", "Journalist or content creator", "Writers and designers keep notebooks for exactly these ideas."),
    o("💸", "A plan to earn your own money", "EN", "Entrepreneur", "That restless planning is how most businesses begin."),
    o("🔩", "How to fix that wobbly fan", "PM", "Electrician", "Electricians and technicians love a problem they can solve with their hands."),
  ] },
];

const v = (prompt: string, a: InterestOption, b: InterestOption): VersusQuestion => ({ kind: "versus", id: a.dim + b.dim + a.emoji, prompt, options: [a, b] });

export const VERSUS: VersusQuestion[] = [
  v("Quick! Which sounds more fun?", o("🔬", "Run a science experiment", "AN", "Pharmacist", "Lab scientists run experiments every day."), o("🎭", "Act in the school play", "CR", "Journalist or content creator", "Actors, presenters and creators perform for a living.")),
  v("Saturday job. Pick one:", o("🚲", "Fix bicycles", "PM", "Automobile technician", "Mechanics keep the world moving."), o("🎫", "Sell 50 tickets for a show", "EN", "Marketing manager", "Sales and marketing people are great at persuading.")),
  v("Which would you rather do?", o("👩‍🏫", "Teach a younger kid maths", "SO", "Teacher", "Teaching is explaining in a way that clicks."), o("🧮", "Crack a tricky maths puzzle alone", "AN", "Data analyst", "Analysts enjoy the puzzle for its own sake.")),
  v("Gut feeling. Go!", o("🎨", "Design a logo", "CR", "Graphic or UI designer", "Every brand you know paid a designer for its logo."), o("🔌", "Wire a working circuit", "PM", "Robotics or electronics technician", "Every gadget you own started as a circuit.")),
  v("Pick your summer:", o("🏪", "Help run a family shop", "EN", "Entrepreneur", "Shop owners learn money, people and planning all at once."), o("🏥", "Volunteer at a hospital", "SO", "Nurse", "Hospital volunteers see how much care work matters.")),
  v("Making a video game. Your job?", o("💻", "Write the code", "AN", "Software developer", "Game programmers turn rules into code."), o("✏️", "Draw the characters", "CR", "Animator or video editor", "Game artists design how everything looks.")),
  v("Which world feels like you?", o("🦺", "Hard hat on a building site", "PM", "Civil engineer", "Site engineers watch their plans become real."), o("💼", "Leading the team meeting", "EN", "Marketing manager", "Managers turn many ideas into one plan.")),
  v("Annual day. You'd rather…", o("🎤", "Host it on stage", "SO", "Teacher", "Hosts and teachers connect with a crowd."), o("📝", "Write the whole script", "CR", "Journalist or content creator", "Script writers decide what everyone says.")),
  v("In a team game, you play…", o("🏆", "To win. Strategy first", "EN", "Entrepreneur", "Strategy and drive are leadership skills."), o("🫶", "To make sure everyone has fun", "SO", "Psychologist or counsellor", "Team spirit is a real career skill.")),
  v("Uniform for a day:", o("🥼", "A lab coat", "AN", "Doctor", "Doctors and scientists wear one daily."), o("🧰", "A tool belt", "PM", "Electrician", "Technicians carry their whole office on their belt.")),
];

export const MYTHS: MythQuestion[] = [
  { kind: "myth", id: "ca", statement: "You can become a Chartered Accountant even if you take Science or Arts in 11th.", answer: true, explain: "CA Foundation is open after 12th in any stream. Commerce helps, but it is not required." },
  { kind: "myth", id: "diploma", statement: "After a Polytechnic diploma, you can never get an engineering degree.", answer: false, explain: "Diploma holders can join the second year of B.E./B.Tech through direct second-year admission in Maharashtra." },
  { kind: "myth", id: "arts", statement: "Arts is only for students who didn't score well.", answer: false, explain: "Law, psychology, design, journalism and civil services all welcome Arts students. Choose a stream for what you enjoy, not to match your marks." },
  { kind: "myth", id: "mbbs", statement: "To become a doctor (MBBS), you need Biology in 11th–12th and must clear NEET.", answer: true, explain: "MBBS needs Physics, Chemistry and Biology in 12th and a NEET-UG score." },
  { kind: "myth", id: "iti", statement: "ITI courses take just 1–2 years and can lead straight to a job or apprenticeship.", answer: true, explain: "ITI trades like Electrician or Fitter are short, practical and built around real workshop skills." },
  { kind: "myth", id: "design", statement: "You must be a maths topper to become a designer.", answer: false, explain: "Design entrance tests check creativity, drawing and observation. Most B.Des courses accept students from any stream." },
  { kind: "myth", id: "games", statement: "Game developers just play games all day.", answer: false, explain: "They write code, design levels, fix bugs and test for hours. Logic, maths and art all help." },
  { kind: "myth", id: "law", statement: "You can start a law degree straight after 12th, from any stream.", answer: true, explain: "The 5-year integrated law degree is open after 12th through exams like CLAT and MH CET Law." },
  { kind: "myth", id: "hotel", statement: "Hotel management needs Science in 12th.", answer: false, explain: "The national hotel management entrance (NCHM JEE) is open to students from any stream." },
  { kind: "myth", id: "locked", statement: "The stream you pick after 10th locks your career forever.", answer: false, explain: "People switch all the time: diploma to degree, Science to design, Commerce to law. Your first choice is a starting point." },
];

export const GUESSES: GuessQuestion[] = [
  { kind: "guess", id: "civil", clue: "I spend my days on building sites and at a computer, checking that bridges and buildings are strong and safe.", options: ["Interior designer", "Civil engineer", "Electrician", "Bank officer"], answer: 1, explain: "Civil engineers start with a Civil diploma after 10th, or Science with Maths and then B.E." },
  { kind: "guess", id: "food", clue: "I test and tweak recipes in a lab so the biscuits in your bag stay crunchy for months.", options: ["Chef", "Pharmacist", "Food technologist", "Farmer"], answer: 2, explain: "Food technologists study Food Technology after 12th Science or through a diploma." },
  { kind: "guess", id: "counsellor", clue: "I listen to people's worries, help them understand their feelings and find a way forward.", options: ["Counsellor", "Lawyer", "Bank officer", "Journalist"], answer: 0, explain: "Counsellors usually study Psychology (Arts or Science), then a master's degree." },
  { kind: "guess", id: "ca", clue: "I check a company's accounts, plan its taxes and make sure every rupee is where it should be.", options: ["Marketing manager", "Data analyst", "Shop owner", "Chartered Accountant"], answer: 3, explain: "Chartered Accountants clear CA Foundation, Intermediate and Final with practical training." },
  { kind: "guess", id: "animator", clue: "I turn a director's ideas into moving characters, frame by frame.", options: ["Animator", "Photographer", "Sound engineer", "Architect"], answer: 0, explain: "Animators study animation or multimedia after 12th in any stream. A portfolio matters most." },
  { kind: "guess", id: "data", clue: "I find patterns in huge piles of numbers so companies can make smarter decisions.", options: ["Librarian", "Data analyst", "Stockbroker", "Electrician"], answer: 1, explain: "Data analysts study maths, statistics, computers or commerce, plus spreadsheets and coding." },
  { kind: "guess", id: "physio", clue: "I help people walk and move again after an injury, using exercise and therapy.", options: ["Surgeon", "Fitness trainer", "Physiotherapist", "Pharmacist"], answer: 2, explain: "Physiotherapists study a 4.5-year BPT after 12th Science with Biology." },
  { kind: "guess", id: "electrician", clue: "I wire buildings, fix faults and make sure nobody gets a shock.", options: ["Plumber", "Electrician", "Civil engineer", "Mechanic"], answer: 1, explain: "Electricians often train through the 2-year ITI Electrician trade with an apprenticeship." },
];

export type Career = { name: string; emoji: string; dims: Dimension[]; does: string; routes: PathwayId[]; study: string; exams: string[]; subjects: string[] };

export const CAREERS: Career[] = [
  { name: "Doctor", emoji: "🩺", dims: ["AN", "SO"], does: "Diagnose and treat illness, and guide patients and families.", routes: ["fyjc_science"], study: "Science with Biology in 11th–12th, then a 5.5-year MBBS.", exams: ["NEET-UG"], subjects: ["Biology", "Chemistry", "Physics"] },
  { name: "Nurse", emoji: "💉", dims: ["SO", "AN"], does: "Care for patients and give treatment in hospitals and clinics.", routes: ["fyjc_science", "vocational"], study: "B.Sc Nursing after 12th Science, or nursing diplomas such as GNM.", exams: ["Nursing entrance (varies)"], subjects: ["Biology", "Chemistry"] },
  { name: "Pharmacist", emoji: "💊", dims: ["AN", "SO"], does: "Prepare and explain medicines and check they are used safely.", routes: ["fyjc_science", "polytechnic_diploma"], study: "D.Pharm or B.Pharm after 12th Science.", exams: ["MHT-CET"], subjects: ["Chemistry", "Biology"] },
  { name: "Software developer", emoji: "💻", dims: ["AN", "PM"], does: "Design, write and test the code behind apps and websites.", routes: ["fyjc_science", "polytechnic_diploma"], study: "B.E./B.Tech, BCA or B.Sc Computer Science, or a Computer diploma then direct second-year engineering.", exams: ["MHT-CET", "JEE Main"], subjects: ["Mathematics", "Computers"] },
  { name: "Data analyst", emoji: "📊", dims: ["AN", "EN"], does: "Study data to find patterns that help teams decide.", routes: ["fyjc_science", "fyjc_commerce"], study: "A degree in Statistics, Maths, Computer Science, Economics or Commerce.", exams: [], subjects: ["Mathematics"] },
  { name: "Civil engineer", emoji: "🌉", dims: ["PM", "AN"], does: "Plan and supervise roads, bridges and buildings.", routes: ["polytechnic_diploma", "fyjc_science"], study: "Civil diploma after 10th, or 12th Science with Maths then B.E. Civil.", exams: ["MHT-CET", "JEE Main"], subjects: ["Mathematics", "Physics"] },
  { name: "Automobile technician", emoji: "🚗", dims: ["PM"], does: "Maintain, repair and test vehicles and engines.", routes: ["iti_trade", "polytechnic_diploma"], study: "ITI Mechanic Motor Vehicle, or an Automobile or Mechanical diploma.", exams: [], subjects: ["Science", "Mathematics"] },
  { name: "Electrician", emoji: "⚡", dims: ["PM"], does: "Install and repair wiring and electrical equipment safely.", routes: ["iti_trade", "polytechnic_diploma"], study: "The 2-year ITI Electrician trade, or an Electrical diploma.", exams: [], subjects: ["Science", "Mathematics"] },
  { name: "Robotics or electronics technician", emoji: "🤖", dims: ["PM", "AN"], does: "Build, program and repair electronic devices and robots.", routes: ["polytechnic_diploma", "iti_trade", "fyjc_science"], study: "Electronics or Mechatronics diploma, an ITI electronics trade, or B.E. after Science.", exams: ["MHT-CET"], subjects: ["Physics", "Mathematics"] },
  { name: "Architect", emoji: "🏛️", dims: ["CR", "AN"], does: "Design buildings and spaces that are safe and beautiful.", routes: ["fyjc_science", "polytechnic_diploma"], study: "A 5-year B.Arch after 12th with Maths, or a diploma with Maths.", exams: ["NATA", "JEE Main Paper 2"], subjects: ["Mathematics", "Drawing"] },
  { name: "Graphic or UI designer", emoji: "🎨", dims: ["CR", "AN"], does: "Design logos, posters, apps and websites.", routes: ["fyjc_arts", "vocational", "fyjc_commerce"], study: "B.Des or BFA after 12th in any stream, or design diplomas with a portfolio.", exams: ["UCEED", "NID DAT", "NIFT"], subjects: ["Art", "English"] },
  { name: "Animator or video editor", emoji: "🎬", dims: ["CR", "PM"], does: "Create animation, edit videos and build game worlds.", routes: ["fyjc_arts", "vocational"], study: "Animation, multimedia or film courses after 12th in any stream.", exams: ["College design tests"], subjects: ["Art", "Computers"] },
  { name: "Fashion designer", emoji: "👗", dims: ["CR", "EN"], does: "Design clothes and plan how they are made and sold.", routes: ["fyjc_arts", "vocational", "fyjc_commerce"], study: "B.Des Fashion after 12th in any stream, or fashion diplomas.", exams: ["NIFT", "NID DAT"], subjects: ["Art"] },
  { name: "Journalist or content creator", emoji: "📰", dims: ["CR", "SO"], does: "Research, write, film and present stories.", routes: ["fyjc_arts", "fyjc_commerce"], study: "BA or BMM (Mass Media) after 12th in any stream.", exams: ["College entrance (varies)"], subjects: ["English", "Marathi or Hindi"] },
  { name: "Chartered Accountant", emoji: "🧾", dims: ["EN", "AN"], does: "Audit accounts, plan taxes and advise businesses.", routes: ["fyjc_commerce", "fyjc_science", "fyjc_arts"], study: "CA Foundation after 12th in any stream, then Intermediate and Final.", exams: ["CA Foundation"], subjects: ["Mathematics", "Accounts"] },
  { name: "Entrepreneur", emoji: "🚀", dims: ["EN", "CR"], does: "Spot a need, start a business and lead a team.", routes: ["fyjc_commerce", "vocational", "polytechnic_diploma"], study: "Any route works. BBA, B.Com or a technical diploma plus real projects.", exams: [], subjects: ["Mathematics", "English"] },
  { name: "Marketing manager", emoji: "📣", dims: ["EN", "SO"], does: "Understand customers and plan how products are sold.", routes: ["fyjc_commerce", "fyjc_arts"], study: "BBA, BMS or B.Com, often followed by an MBA.", exams: ["BBA/BMS CET"], subjects: ["English", "Economics"] },
  { name: "Event manager", emoji: "🎉", dims: ["EN", "SO"], does: "Run hotels and events so guests have a great time.", routes: ["fyjc_commerce", "fyjc_arts", "vocational"], study: "Hotel or event management courses after 12th in any stream.", exams: ["NCHM JEE"], subjects: ["English"] },
  { name: "Lawyer", emoji: "⚖️", dims: ["EN", "AN", "SO"], does: "Advise clients and argue cases in court.", routes: ["fyjc_arts", "fyjc_commerce", "fyjc_science"], study: "5-year integrated law after 12th in any stream.", exams: ["CLAT", "MH CET Law"], subjects: ["English", "History"] },
  { name: "Teacher", emoji: "👩‍🏫", dims: ["SO", "CR"], does: "Plan lessons, explain ideas and help students grow.", routes: ["fyjc_arts", "fyjc_science", "fyjc_commerce"], study: "A degree in the subject you love, then a B.Ed.", exams: ["B.Ed CET", "TET"], subjects: ["Your favourite subject"] },
  { name: "Psychologist or counsellor", emoji: "🧠", dims: ["SO", "AN"], does: "Understand behaviour and help people with stress and choices.", routes: ["fyjc_arts", "fyjc_science"], study: "BA or B.Sc Psychology, then a master's degree.", exams: [], subjects: ["Psychology", "Biology"] },
  { name: "Social worker", emoji: "🫶", dims: ["SO", "EN"], does: "Support communities through NGOs, hospitals and schemes.", routes: ["fyjc_arts"], study: "BA or BSW, then an MSW.", exams: [], subjects: ["Sociology", "English"] },
  { name: "Agriculture scientist", emoji: "🌾", dims: ["AN", "PM", "EN"], does: "Improve crops, soil and farm businesses with science.", routes: ["fyjc_science", "vocational", "polytechnic_diploma"], study: "B.Sc Agriculture after 12th Science, or agriculture diplomas.", exams: ["MHT-CET (PCB)"], subjects: ["Biology", "Chemistry"] },
  { name: "Chef", emoji: "👨‍🍳", dims: ["CR", "PM"], does: "Create dishes and run kitchens.", routes: ["vocational", "iti_trade", "fyjc_arts"], study: "Culinary or hotel management courses; ITI food production trades.", exams: ["NCHM JEE"], subjects: ["Science"] },
];

export const EXPERIMENTS: Record<Dimension, string[]> = {
  AN: ["Pick a question you've always wondered about. Research it for 30 minutes and write down five things you learned.", "Try a free coding lesson (like Scratch) or a logic puzzle and notice whether time flies."],
  PM: ["With an adult's OK, repair or take apart something old at home and put it back together.", "Visit a local garage, workshop or ITI and ask someone what a normal day looks like."],
  CR: ["Make a poster or a 60-second video about something you care about and show three people.", "Keep an idea notebook for one week: sketches, stories, designs, songs."],
  EN: ["With a parent's OK, sell something small to friends. Track what it cost and what you earned.", "Plan a class event: budget, timetable and who does what."],
  SO: ["Teach a younger sibling or neighbour something for 20 minutes.", "Volunteer for a day at a school event, a local NGO or helping a neighbour."],
};

export const ROUND_PLAN: Question["kind"][] = ["scenario", "versus", "scenario", "myth", "scenario", "versus", "guess", "scenario", "versus", "myth", "scenario", "guess"];
export const QUEST_STORAGE_NAME = "cq_career_quest_v1";
export const LEVELS = [
  { at: 0, name: "Curious Explorer" },
  { at: 80, name: "Path Finder" },
  { at: 160, name: "Career Scout" },
  { at: 240, name: "Future Builder" },
  { at: 300, name: "Quest Legend" },
];

export function levelFor(xp: number) {
  let index = 0;
  LEVELS.forEach((level, i) => { if (xp >= level.at) index = i; });
  const next = LEVELS[index + 1];
  return { index, name: LEVELS[index].name, next, progress: next ? (xp - LEVELS[index].at) / (next.at - LEVELS[index].at) : 1 };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// A fresh mix every game: questions are drawn without repeats and options are shuffled.
export function buildQuest(random: () => number = Math.random): Question[] {
  const pools = { scenario: shuffle(SCENARIOS, random), versus: shuffle(VERSUS, random), myth: shuffle(MYTHS, random), guess: shuffle(GUESSES, random) };
  return ROUND_PLAN.map((kind) => {
    const question = pools[kind].shift()!;
    if (question.kind === "scenario") return { ...question, options: shuffle(question.options, random) };
    if (question.kind === "guess") {
      const order = shuffle(question.options.map((_, i) => i), random);
      return { ...question, options: order.map((i) => question.options[i]), answer: order.indexOf(question.answer) };
    }
    return question;
  });
}

export type Tally = Record<Dimension, { picked: number; offered: number }>;
export const emptyTally = (): Tally => ({ AN: { picked: 0, offered: 0 }, PM: { picked: 0, offered: 0 }, CR: { picked: 0, offered: 0 }, EN: { picked: 0, offered: 0 }, SO: { picked: 0, offered: 0 } });

// Share of the times a dimension was on offer that the player chose it, so a
// dimension that happened to appear more often is not favoured.
export function interestProfile(tally: Tally) {
  return (Object.keys(tally) as Dimension[])
    .map((dim) => ({ dim, fit: tally[dim].offered ? tally[dim].picked / tally[dim].offered : 0 }))
    .sort((a, b) => b.fit - a.fit);
}

export function matchCareers(profile: { dim: Dimension; fit: number }[], count = 4) {
  const fit = Object.fromEntries(profile.map((p) => [p.dim, p.fit])) as Record<Dimension, number>;
  const weights = [1, .6, .4];
  return CAREERS
    .map((career) => ({ career, score: career.dims.reduce((sum, dim, i) => sum + fit[dim] * weights[i], 0) / career.dims.reduce((sum, _, i) => sum + weights[i], 0) * (career.dims.length > 1 ? 1 : .9) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export function matchRoutes(careers: { career: Career; score: number }[]) {
  const scores = new Map<PathwayId, { score: number; careers: string[] }>();
  careers.forEach(({ career, score }) => career.routes.forEach((id, i) => {
    const entry = scores.get(id) || { score: 0, careers: [] };
    entry.score += score * (i === 0 ? 1 : .7);
    entry.careers.push(career.name);
    scores.set(id, entry);
  }));
  return [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).map(([id, entry]) => ({ id, ...entry }));
}
