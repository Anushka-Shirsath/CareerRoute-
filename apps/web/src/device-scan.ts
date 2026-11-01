"use client";
// Reads a marksheet entirely in the browser. The file never leaves the
// student's device: only the marks found here are sent, after the student
// has seen them. The reading rules mirror services/api/app/pdf_extract.py.
import type { Subject } from "./types";

type Canonical = Subject["canonical_subject"];
export type ScanProgress = { stage: string; percent: number };
type Report = (progress: ScanProgress) => void;

const SUBJECTS: Record<string, Canonical> = {
  english: "english",
  marathi: "first_language",
  hindi: "second_language",
  sanskrit: "third_language",
  mathematics: "mathematics",
  maths: "mathematics",
  algebra: "mathematics",
  geometry: "mathematics",
  science: "science",
  "science and technology": "science",
  "science and technology part 1": "science",
  "science and technology part 2": "science",
  "science & technology": "science",
  "social science": "social_science",
  "social sciences": "social_science",
  history: "social_science",
  geography: "social_science",
  physics: "science",
  chemistry: "science",
  biology: "science",
};

export class ScanError extends Error {}

function subject(name: string, obtained: string, maximum: string): Subject | null {
  const shown = name.split(/\s+/).filter(Boolean).join(" ");
  const canonical = SUBJECTS[shown.toLowerCase()];
  const got = Number(obtained), max = Number(maximum);
  if (!canonical || !Number.isFinite(got) || !Number.isFinite(max) || max <= 0 || got < 0 || got > max) return null;
  return { canonical_subject: canonical, name_as_shown: shown, obtained: got, maximum: max, grade_label: null, source: "extracted" } as Subject;
}

const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, onehundred: 100 };
for (const tens of ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"])
  for (const unit of ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"])
    WORDS[tens + unit] = WORDS[tens] + WORDS[unit];
const SSC_NAMES: Record<string, string> = { marathi: "MARATHI", hindi: "HINDI", english: "ENGLISH", mathematics: "MATHEMATICS", "science & technology": "SCIENCE & TECHNOLOGY", "social sciences": "SOCIAL SCIENCES" };

// SSC statements write each mark in words too. A row only counts when the
// figure and the words agree, which catches most OCR misreadings.
function sscRows(text: string): Subject[] {
  const lower = text.toLowerCase();
  if (!lower.includes("subject code") || !lower.includes("marks or grade obtained")) return [];
  const pattern = /^\s*(?:\d{1,3}\s+)?(marathi|hindi|english|mathematics|science\s*&\s*technology|social\s+sciences)\s*(?:\([^)]*\))?\s+(\d{1,3})\s+(\d{1,3})\s+([a-z ]+)\s*$/i;
  const rows: Subject[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(pattern);
    if (!match) continue;
    const [, name, maximum, obtained, written] = match;
    if (WORDS[written.replace(/\s+/g, "").toLowerCase()] !== Number(obtained)) continue;
    const label = SSC_NAMES[name.toLowerCase().split(/\s+/).join(" ")];
    const item = label && subject(label, obtained, maximum);
    if (item) rows.push(item);
  }
  return rows;
}

export function subjectsFromText(text: string): Subject[] {
  const found = sscRows(text);
  let order: ["maximum", "obtained"] | ["obtained", "maximum"] | null = null;
  for (const line of text.split("\n")) {
    const header = line.toLowerCase();
    if (header.includes("subject") && header.includes("maximum") && header.includes("obtained")) {
      order = header.indexOf("maximum") < header.indexOf("obtained") ? ["maximum", "obtained"] : ["obtained", "maximum"];
      continue;
    }
    let match = line.match(/^\s*([A-Za-z][A-Za-z &0-9().-]{1,70}?)\s*:?\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match && order) {
      const columns = line.match(/^\s*([A-Za-z][A-Za-z &0-9().-]{1,70}?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
      if (columns) {
        const values = { [order[0]]: columns[2], [order[1]]: columns[3] } as Record<string, string>;
        const item = subject(columns[1], values.obtained, values.maximum);
        if (item) found.push(item);
      }
      continue;
    }
    if (!match) continue;
    const item = subject(match[1], match[2], match[3]);
    if (item) found.push(item);
  }
  return found;
}

// Identical readings of one subject are merged; conflicting readings are
// refused so the student types them instead of trusting a guess.
export function settle(found: Subject[]): Subject[] {
  const byName = new Map<string, Subject>();
  for (const item of found) {
    const key = item.name_as_shown.toLowerCase();
    const seen = byName.get(key);
    if (seen && (seen.obtained !== item.obtained || seen.maximum !== item.maximum))
      throw new ScanError("Conflicting subject marks found. Please enter them manually.");
    byName.set(key, item);
  }
  if (!byName.size)
    throw new ScanError("No clearly labelled subject marks were found. Try a clear, upright photo or enter marks manually.");
  return [...byName.values()];
}

type Word = { text: string; along: number; across: number; size: number };

// Group words into rows along the page's measured tilt, so a slightly
// angled phone photo keeps each subject on the same line as its marks.
function rowsToText(words: { text: string; x0: number; y0: number; x1: number; y1: number }[], tilt: number) {
  const placed: Word[] = words.filter((w) => w.text.trim()).map((w) => {
    const x = (w.x0 + w.x1) / 2, y = (w.y0 + w.y1) / 2;
    return { text: w.text.trim(), along: x * Math.cos(tilt) + y * Math.sin(tilt), across: y * Math.cos(tilt) - x * Math.sin(tilt), size: w.y1 - w.y0 };
  });
  const rows: Word[][] = [];
  for (const word of placed.sort((a, b) => a.across - b.across)) {
    const row = rows.find((r) => Math.abs(r.reduce((t, w) => t + w.across, 0) / r.length - word.across) < Math.max(r[0].size, word.size) * 0.6);
    if (row) row.push(word);
    else rows.push([word]);
  }
  return rows.map((r) => r.sort((a, b) => a.along - b.along).map((w) => w.text).join(" ")).join("\n");
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

async function ocr(canvases: HTMLCanvasElement[], report: Report) {
  const { createWorker } = await import("tesseract.js");
  report({ stage: "Preparing the reader", percent: 5 });
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") report({ stage: "Reading your marksheet", percent: 30 + Math.round(m.progress * 65) });
      else if (m.status.startsWith("loading")) report({ stage: "Preparing the reader", percent: 5 + Math.round(m.progress * 25) });
    },
  });
  try {
    const pages: string[] = [];
    for (const canvas of canvases) {
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      const words = lines.flatMap((l) => l.words.map((w) => ({ text: w.text, ...w.bbox })));
      const tilt = median(lines.filter((l) => l.bbox.x1 - l.bbox.x0 > canvas.width * 0.15)
        .map((l) => Math.atan2(l.baseline.y1 - l.baseline.y0, l.baseline.x1 - l.baseline.x0)));
      pages.push(rowsToText(words, tilt));
    }
    return pages.join("\n");
  } finally {
    await worker.terminate();
  }
}

async function imageCanvas(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new ScanError("The image could not be read. Use a clear PNG or JPEG.");
  });
  if (bitmap.width * bitmap.height > 20_000_000) throw new ScanError("The image is too large. Use a photo under 20 megapixels.");
  // Shrink very large photos and enlarge only small ones: enlarging an
  // ordinary blurry phone photo makes Tesseract misread digits.
  const side = Math.max(bitmap.width, bitmap.height);
  const scale = side > 2400 ? 2400 / side : side < 1200 ? 1600 / side : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function pdfPages(file: File, report: Report) {
  report({ stage: "Opening the PDF", percent: 5 });
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise.catch(() => {
    throw new ScanError("PDF could not be read. Use manual entry.");
  });
  try {
    if (pdf.numPages > 3) throw new ScanError("PDF must have at most 3 pages.");
    const texts: string[] = [], canvases: HTMLCanvasElement[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) => ("str" in item && item.str.trim() ? [item] : []));
      // PDF text runs carry positions; rebuild visual lines from them.
      texts.push(rowsToText(items.map((item) => {
        const [, , , , x, y] = item.transform, h = item.height || 10;
        return { text: item.str, x0: x, x1: x + item.width, y0: -y - h, y1: -y };
      }), 0));
      const viewport = page.getViewport({ scale: Math.min(2.5, 2400 / Math.max(page.view[2], page.view[3])) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return { text: texts.join("\n"), canvases };
  } finally {
    await pdf.destroy();
  }
}

export async function readMarksheet(file: File, report: Report = () => {}) {
  if (file.size > 5 * 1024 * 1024) throw new ScanError("Choose a file smaller than 5 MiB.");
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isImage = ["image/png", "image/jpeg"].includes(file.type) || /\.(png|jpe?g)$/.test(name);
  if (!isPdf && !isImage) throw new ScanError("Choose a PDF, PNG, or JPEG file.");
  const warnings = [
    "Extraction is a draft. Check and confirm every subject.",
    "Only clearly labelled subject marks were extracted. Enter any missing subjects manually.",
  ];
  let found: Subject[] = [];
  if (isPdf) {
    const { text, canvases } = await pdfPages(file, report);
    found = subjectsFromText(text);
    // A downloaded PDF often has selectable text; a scanned one needs OCR.
    if (!found.length) {
      found = subjectsFromText(await ocr(canvases, report));
      warnings.push("Read on your device from an image: OCR can make mistakes, so compare every value with the original.");
    }
  } else {
    found = subjectsFromText(await ocr([await imageCanvas(file)], report));
    warnings.push("Read on your device from an image: OCR can make mistakes, so compare every value with the original.");
  }
  report({ stage: "Done", percent: 100 });
  return { subjects: settle(found), warnings };
}
