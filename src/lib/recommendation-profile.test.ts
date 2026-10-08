import { describe, expect, it } from "vitest";
import { recommendationProfileError } from "@/lib/recommendation-profile";

describe("recommendation profile requirements", () => {
  it("requires a target role for personalized recommendations", () => {
    expect(recommendationProfileError("learning", { target_region: "Nairobi" })).toContain("target role");
  });

  it("requires a location for job search but not learning recommendations", () => {
    const roleOnly = { target_role: "Product designer" };
    expect(recommendationProfileError("jobs", roleOnly)).toContain("target location");
    expect(recommendationProfileError("learning", roleOnly)).toBeNull();
  });
});
