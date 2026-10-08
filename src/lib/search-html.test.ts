import { describe, expect, it } from "vitest";
import { sanitizeSearchEntryPoint } from "@/lib/search-html";

describe("Google Search entry point rendering", () => {
  it("keeps provider links while removing active content and unsafe attributes", () => {
    const result = sanitizeSearchEntryPoint('<div onclick="run()" style="x"><script>alert(1)</script><a href="https://google.com/search">Search</a><a href="javascript:alert(1)">unsafe</a></div>');
    expect(result).toContain('href="https://google.com/search"');
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("style=");
  });

  it("ignores non-string data and caps provider markup", () => {
    expect(sanitizeSearchEntryPoint({})).toBe("");
    expect(sanitizeSearchEntryPoint("x".repeat(60000))).toHaveLength(50000);
  });
});
