import { describe, expect, it } from "vitest";
import { normalizeUsWageLocation, parseWageAmount } from "@/lib/salary-insights";

describe("salary insight input normalization", () => {
  it("accepts supported U.S. location formats and normalizes spaces", () => {
    expect(normalizeUsWageLocation("94105")).toBe("94105");
    expect(normalizeUsWageLocation("  Austin,   TX ")).toBe("Austin, TX");
    expect(normalizeUsWageLocation("ny")).toBe("NY");
    expect(normalizeUsWageLocation("US, 0")).toBe("US, 0");
  });

  it("rejects unsupported international and ambiguous locations", () => {
    expect(normalizeUsWageLocation("Nairobi, Kenya")).toBeNull();
    expect(normalizeUsWageLocation("London, UK")).toBeNull();
    expect(normalizeUsWageLocation("London, NY")).toBe("London, NY");
    expect(normalizeUsWageLocation("London, ZZ")).toBeNull();
    expect(normalizeUsWageLocation("New York")).toBeNull();
  });

  it("parses published wage values and rejects missing, zero, and malformed values", () => {
    expect(parseWageAmount("$125,500")).toBe(125500);
    expect(parseWageAmount("38.75")).toBe(38.75);
    expect(parseWageAmount("* ")).toBeNull();
    expect(parseWageAmount("$0")).toBeNull();
    expect(parseWageAmount(125500)).toBeNull();
  });
});
