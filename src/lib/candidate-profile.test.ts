import { describe, expect, it } from "vitest";
import { mergeCareerProfileData, normalizeCareerProfileData } from "@/lib/candidate-profile";

describe("candidate profile structuring", () => {
  it("drops malformed values, deduplicates lists, and enforces field limits", () => {
    const profile = normalizeCareerProfileData({
      headline: "  Product manager  ", skills: ["SQL", "SQL", 12],
      experiences: [{ title: "Analyst", organization: "Example", description: "A".repeat(1000) }, null, "bad"],
      achievements: ["B".repeat(600)], unexpected: "discarded",
    });
    expect(profile.headline).toBe("Product manager");
    expect(profile.skills).toEqual(["SQL"]);
    expect(profile.experiences).toHaveLength(1);
    expect(profile.experiences[0].description).toHaveLength(700);
    expect(profile.achievements[0]).toHaveLength(500);
    expect("unexpected" in profile).toBe(false);
  });

  it("reconciles imported career facts without overwriting existing facts", () => {
    const merged = mergeCareerProfileData(
      { skills: ["SQL"], experiences: [{ title: "Analyst", organization: "A" }] },
      { skills: ["SQL", "Python"], experiences: [{ title: "Engineer", organization: "B" }], headline: "Data professional" },
    );
    expect(merged.skills).toEqual(["SQL", "Python"]);
    expect(merged.experiences).toHaveLength(2);
    expect(merged.headline).toBe("Data professional");
  });

  it("keeps earlier profile summaries when a new document adds a different summary", () => {
    const merged = mergeCareerProfileData({ summary: "Earlier CV facts" }, { summary: "New LinkedIn facts" });
    expect(merged.summary).toContain("Earlier CV facts");
    expect(merged.summary).toContain("New LinkedIn facts");
  });

  it("reconciles partial records and case-insensitive skills without losing conflicting facts", () => {
    const merged = mergeCareerProfileData(
      {
        experiences: [{ title: "Product Designer", organization: "Acme", location: "Nairobi", startDate: "2021", endDate: "", description: "" }],
        education: [{ institution: "State University", qualification: "MSc", fieldOfStudy: "", startDate: "", endDate: "2020" }],
        skills: ["Figma", "UX Research"],
      },
      {
        experiences: [{ title: "product designer", organization: "ACME", location: "Remote", startDate: "2021", endDate: "2024", description: "Led design systems" }],
        education: [{ institution: "State University", qualification: "MSc", fieldOfStudy: "Human-Computer Interaction", startDate: "2018", endDate: "2020" }],
        skills: ["figma", "Prototyping"],
      },
    );
    expect(merged.experiences).toHaveLength(1);
    expect(merged.experiences[0]).toMatchObject({ location: "Nairobi", endDate: "2024", description: "Led design systems" });
    expect(merged.education).toHaveLength(1);
    expect(merged.education[0].fieldOfStudy).toBe("Human-Computer Interaction");
    expect(merged.skills).toEqual(["Figma", "UX Research", "Prototyping"]);
    expect(merged.reviewNotes).toContain('Experience has conflicting location: kept "Nairobi" and also found "Remote". Review both source documents.');
  });

  it("keeps separate roles at the same employer when the start dates differ", () => {
    const merged = mergeCareerProfileData(
      { experiences: [{ title: "Engineer", organization: "Acme", startDate: "2020", endDate: "2021" }] },
      { experiences: [{ title: "Engineer", organization: "Acme", startDate: "2023", endDate: "2024" }] },
    );
    expect(merged.experiences).toHaveLength(2);
  });
});
