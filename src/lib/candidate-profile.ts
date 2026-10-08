import { emptyCareerProfileData, type CareerProfileData } from "@/lib/database.types";

const text = (value: unknown, limit = 700) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, limit) : "";
const list = (value: unknown, max = 40, limit = 240) => Array.isArray(value)
  ? Array.from(new Set(value.map((item) => text(item, limit)).filter(Boolean))).slice(0, max)
  : [];
const records = <T extends Record<string, unknown>>(value: unknown, fields: (keyof T)[], max = 30): T[] => Array.isArray(value)
  ? value.slice(0, max).flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const result = Object.fromEntries(fields.map((field) => [field, text((row as Record<string, unknown>)[field as string])])) as T;
    return Object.values(result).some(Boolean) ? [result] : [];
  })
  : [];

export function normalizeCareerProfileData(value: unknown): CareerProfileData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(emptyCareerProfileData);
  const item = value as Record<string, unknown>;
  return {
    fullName: text(item.fullName, 160), headline: text(item.headline, 300), summary: text(item.summary, 3000),
    experiences: records(item.experiences, ["title", "organization", "location", "startDate", "endDate", "description"], 25),
    education: records(item.education, ["institution", "qualification", "fieldOfStudy", "startDate", "endDate"], 20),
    certifications: records(item.certifications, ["name", "issuer", "date"], 30),
    achievements: list(item.achievements, 30, 500), skills: list(item.skills, 80, 100),
    languages: list(item.languages, 20, 100), targetRoles: list(item.targetRoles, 20, 120), evidenceGaps: list(item.evidenceGaps, 20, 200), reviewNotes: list(item.reviewNotes, 20, 300),
  };
}

export function mergeCareerProfileData(current: unknown, incoming: unknown): CareerProfileData {
  const left = normalizeCareerProfileData(current), right = normalizeCareerProfileData(incoming);
  const normalizeKey = (value: string) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const mergeText = (a: string[], b: string[]) => {
    const seen = new Set(a.map(normalizeKey));
    return [...a, ...b.filter((value) => {
      const key = normalizeKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })];
  };
  const reviewNotes = mergeText(left.reviewNotes, right.reviewNotes);
  const mergeRecords = <T extends Record<string, string>>(
    currentRecords: T[],
    incomingRecords: T[],
    identity: (record: T) => string,
    label: string,
    matches: (currentRecord: T, incomingRecord: T) => boolean = (currentRecord, incomingRecord) => identity(currentRecord) === identity(incomingRecord),
  ) => {
    const merged = currentRecords.map((record) => ({ ...record }));
    for (const incomingRecord of incomingRecords) {
      const key = identity(incomingRecord);
      const existing = key ? merged.find((record) => identity(record) === key && matches(record, incomingRecord)) : undefined;
      if (!existing) {
        merged.push({ ...incomingRecord });
        continue;
      }
      for (const [field, value] of Object.entries(incomingRecord)) {
        const prior = existing[field as keyof T];
        if (!prior && value) existing[field as keyof T] = value as T[keyof T];
        else if (prior && value && normalizeKey(prior) !== normalizeKey(value)) {
          const note = `${label} has conflicting ${field}: kept "${prior}" and also found "${value}". Review both source documents.`;
          if (!reviewNotes.some((item) => normalizeKey(item) === normalizeKey(note))) reviewNotes.push(note.slice(0, 300));
        }
      }
    }
    return merged;
  };
  const experienceIdentity = (record: CareerProfileData["experiences"][number]) => {
    const title = normalizeKey(record.title), organization = normalizeKey(record.organization);
    if (!title || !organization) return "";
    return `${title}|${organization}`;
  };
  const matchExperience = (currentRecord: CareerProfileData["experiences"][number], incomingRecord: CareerProfileData["experiences"][number]) => {
    const currentStart = normalizeKey(currentRecord.startDate), incomingStart = normalizeKey(incomingRecord.startDate);
    return !currentStart || !incomingStart || currentStart === incomingStart;
  };
  const educationIdentity = (record: CareerProfileData["education"][number]) => {
    const institution = normalizeKey(record.institution), qualification = normalizeKey(record.qualification);
    return institution && qualification ? `${institution}|${qualification}` : "";
  };
  const certificationIdentity = (record: CareerProfileData["certifications"][number]) => {
    const name = normalizeKey(record.name), issuer = normalizeKey(record.issuer);
    return name && issuer ? `${name}|${issuer}` : "";
  };
  return {
    fullName: left.fullName || right.fullName,
    headline: right.headline || left.headline,
    summary: mergeText(left.summary ? [left.summary] : [], right.summary ? [right.summary] : []).join("\n\n").slice(0, 3000),
    experiences: mergeRecords(left.experiences, right.experiences, experienceIdentity, "Experience", matchExperience).slice(0, 25),
    education: mergeRecords(left.education, right.education, educationIdentity, "Education").slice(0, 20),
    certifications: mergeRecords(left.certifications, right.certifications, certificationIdentity, "Certification").slice(0, 30),
    achievements: mergeText(left.achievements, right.achievements).slice(0, 30),
    skills: mergeText(left.skills, right.skills).slice(0, 80),
    languages: mergeText(left.languages, right.languages).slice(0, 20),
    targetRoles: mergeText(left.targetRoles, right.targetRoles).slice(0, 20),
    evidenceGaps: mergeText(left.evidenceGaps, right.evidenceGaps).slice(0, 20),
    reviewNotes: reviewNotes.slice(0, 20),
  };
}
