const fieldsByFile: Record<string, string[]> = {
  "profile.csv": ["headline", "summary", "industry", "geo location"],
  "positions.csv": ["title", "company name", "description", "location", "started on", "finished on"],
  "education.csv": ["school name", "degree name", "field of study", "activities", "notes", "start date", "end date", "from year", "to year"],
  "skills.csv": ["name"],
  "certifications.csv": ["name", "authority", "started on", "finished on"],
  "languages.csv": ["name", "proficiency"],
  "volunteering.csv": ["organization name", "role", "cause", "description", "start date", "end date"],
};

export type LinkedInImport = { summary: string; skills: string[]; importedFiles: string[] };

export function sanitizeLinkedInPdfText(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email removed]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/(?<!\w)\+?\d[\d().\s-]{7,}\d(?!\w)/g, "[phone removed]")
    .trim()).filter(Boolean).join("\n").slice(0, 30000);
}

export async function extractLinkedInPdfText(file: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: file });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    if (document.numPages > 30) throw new Error("PDF has too many pages");
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").filter(Boolean).join(" "));
    }
  } finally { await loadingTask.destroy(); }
  return sanitizeLinkedInPdfText(pages.join("\n"));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const normalize = (header: string) => header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const displayHeader = (header: string) => header.replace(/\b\w/g, (letter) => letter.toUpperCase());

export function parseLinkedInExports(files: Array<{ name: string; text: string }>): LinkedInImport {
  const sections: string[] = [];
  const skills = new Set<string>();
  const importedFiles: string[] = [];
  for (const file of files) {
    const filename = file.name.split(/[\\/]/).pop()?.toLowerCase() || "";
    const allowedFields = fieldsByFile[filename];
    if (!allowedFields) continue;
    const rows = parseCsv(file.text);
    if (rows.length < 2) continue;
    const headers = rows[0].map(normalize);
    const selected = headers.map((header, index) => ({ header, index })).filter((item) => allowedFields.includes(item.header));
    if (!selected.length) continue;
    const title = filename.replace(".csv", "").replace(/^./, (letter) => letter.toUpperCase());
    const records: string[] = [];
    for (const cells of rows.slice(1)) {
      const values = selected.map(({ header, index }) => ({ header, value: (cells[index] || "").trim().replace(/\s+/g, " ").slice(0, 1200) })).filter((item) => item.value);
      if (!values.length) continue;
      if (filename === "skills.csv") { for (const item of values) skills.add(item.value); continue; }
      records.push(values.map((item) => `${displayHeader(item.header)}: ${item.value}`).join(" · "));
    }
    if (filename === "skills.csv" && skills.size) { importedFiles.push(title); continue; }
    if (records.length) { sections.push(`${title}\n${records.join("\n")}`); importedFiles.push(title); }
  }
  return { summary: sections.join("\n\n").slice(0, 4000), skills: Array.from(skills).slice(0, 100), importedFiles };
}
