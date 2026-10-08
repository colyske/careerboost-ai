import { describe, expect, it } from "vitest";
import { candidateSkillSet, matchScore } from "@/lib/candidate-matching";

describe("candidate matching", () => {
  it("combines manually entered and imported vault skills", () => {
    const skills = candidateSkillSet("SQL, Excel", { skills: ["Python", "SQL"] });
    expect(Array.from(skills)).toEqual(["sql", "excel", "python"]);
    expect(matchScore(["Python", "Excel", "Go"], skills)).toBe(67);
  });

  it("does not award a match for jobs without explicit required skills", () => {
    expect(matchScore([], new Set(["python"]))).toBe(0);
    expect(matchScore(["   "], new Set(["python"]))).toBe(0);
  });
});
