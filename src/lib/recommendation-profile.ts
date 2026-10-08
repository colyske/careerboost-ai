export type RecommendationKind = "jobs" | "learning";
export type RecommendationProfile = { target_role?: string | null; target_region?: string | null } | null;

export function recommendationProfileError(kind: RecommendationKind, profile: RecommendationProfile) {
  if (!profile || !profile.target_role?.trim()) return "Save your target role in the Candidate Vault first.";
  if (kind === "jobs" && !profile.target_region?.trim()) return "Save your target location in the Candidate Vault before searching for jobs.";
  return null;
}
