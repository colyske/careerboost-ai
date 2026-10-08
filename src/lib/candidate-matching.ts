import { normalizeCareerProfileData } from "@/lib/candidate-profile";

export function candidateSkillSet(profileSkills: unknown, careerData: unknown) {
  const structured = normalizeCareerProfileData(careerData);
  const supplied = typeof profileSkills === "string" ? profileSkills.split(",") : [];
  return new Set([...supplied, ...structured.skills].map((skill) => skill.trim().toLocaleLowerCase()).filter(Boolean));
}

export function matchScore(requiredSkills: string[], candidateSkills: Set<string>) {
  const required = Array.from(new Set(requiredSkills.map((skill) => skill.trim().toLocaleLowerCase()).filter(Boolean)));
  if (!required.length) return 0;
  const matched = required.filter((skill) => candidateSkills.has(skill)).length;
  return Math.round((matched / required.length) * 100);
}
