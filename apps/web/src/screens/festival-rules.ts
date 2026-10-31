export const BOOTHS = [
  { id: "robot", name: "Robot rally", type: "Make", cost: 4, visitors: 7, detail: "Tiny robots. Big ambitions.", color: "coral" },
  { id: "mural", name: "Mural wall", type: "Create", cost: 3, visitors: 5, detail: "Give the whole town a canvas.", color: "pink" },
  { id: "food", name: "Food lab", type: "Discover", cost: 3, visitors: 5, detail: "A little science. A lot of snacks.", color: "yellow" },
  { id: "arcade", name: "Arcade tent", type: "Make", cost: 4, visitors: 8, detail: "One more round? Always.", color: "blue" },
  { id: "music", name: "Music stage", type: "Create", cost: 2, visitors: 4, detail: "Small stage. Main character energy.", color: "orange" },
  { id: "garden", name: "Green garden", type: "Discover", cost: 2, visitors: 3, detail: "Grow something a little wild.", color: "green" },
] as const;
export type Booth = typeof BOOTHS[number];
export type BoothId = Booth["id"];
export const THEMES = ["Create", "Make", "Discover"] as const;
export const CHALLENGES = [
  { name: "The grand opening", goal: 30, budget: 12, description: "Make a little magic with your first festival.", featured: "Create" },
  { name: "Word on the street", goal: 38, budget: 12, description: "The town is talking. Give them a reason to come.", featured: "Make" },
  { name: "The big finale", goal: 44, budget: 13, description: "One extra token. One unforgettable send-off.", featured: "Discover" },
] as const;
export const COMBOS: { ids: readonly BoothId[]; name: string; detail: string }[] = [
  { ids: ["robot", "arcade"], name: "Tech takeover", detail: "Robot rally + Arcade tent" },
  { ids: ["mural", "music"], name: "Art club", detail: "Mural wall + Music stage" },
  { ids: ["food", "garden"], name: "Fresh thinking", detail: "Food lab + Green garden" },
];
export const MAX_BOOTHS = 4;
export const RUSH_SECONDS = 12;
export const MAX_GREETINGS = 5;
export const FESTIVAL_RECORD_STORAGE_NAME = "cq_festival_record_v2";

export function scoreFestival(ids: readonly BoothId[], theme: string) {
  const selected = BOOTHS.filter((booth) => ids.includes(booth.id));
  const base = selected.reduce((total, booth) => total + booth.visitors, 0);
  const featured = selected.filter((booth) => booth.type === theme).length * 3;
  const variety = new Set(selected.map((booth) => booth.type)).size * 2;
  const combos = COMBOS.filter((combo) => combo.ids.every((id) => ids.includes(id)));
  const spent = selected.reduce((total, booth) => total + booth.cost, 0);
  return { base, featured, variety, combos, spent, total: base + featured + variety + combos.length * 5 };
}

export function canAddBooth(ids: readonly BoothId[], id: BoothId, budget: number) {
  const booth = BOOTHS.find((item) => item.id === id);
  return Boolean(booth && !ids.includes(id) && ids.length < MAX_BOOTHS && scoreFestival(ids, "").spent + booth.cost <= budget);
}
