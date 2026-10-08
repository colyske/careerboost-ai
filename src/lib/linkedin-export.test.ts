import { describe, expect, it } from "vitest";
import { parseCsv, parseLinkedInExports, sanitizeLinkedInPdfText } from "@/lib/linkedin-export";

describe("LinkedIn export import", () => {
  it("parses quoted commas, escaped quotes, embedded newlines, and BOM", () => {
    expect(parseCsv('\uFEFFName,Description\r\n"Acme, Inc.","First line\nSecond ""quoted"" line"')).toEqual([
      ["Name", "Description"], ["Acme, Inc.", 'First line\nSecond "quoted" line'],
    ]);
  });

  it("imports career fields and excludes contact/account data and unrelated files", () => {
    const result = parseLinkedInExports([
      { name: "Profile.csv", text: "First Name,Last Name,Email Address,Headline,Summary\nAda,Lovelace,ada@example.com,Engineer,Builds reliable systems" },
      { name: "Positions.csv", text: "Company Name,Title,Description\nAnalytical Engines,Engineer,Designed safe systems" },
      { name: "Skills.csv", text: "Name\nTypeScript\nSystems design" },
      { name: "Connections.csv", text: "First Name,Last Name,Email Address\nOther,Person,other@example.com" },
    ]);
    expect(result.summary).toContain("Headline: Engineer");
    expect(result.summary).toContain("Title: Engineer");
    expect(result.summary).not.toContain("ada@example.com");
    expect(result.summary).not.toContain("other@example.com");
    expect(result.skills).toEqual(["TypeScript", "Systems design"]);
    expect(result.importedFiles).toEqual(["Profile", "Positions", "Skills"]);
  });

  it("removes direct contact details from locally extracted PDF text", () => {
    const result = sanitizeLinkedInPdfText("Product designer\nada@example.com\n+1 (212) 555-0100\nLed a team of designers");
    expect(result).toContain("Product designer");
    expect(result).toContain("Led a team of designers");
    expect(result).not.toContain("ada@example.com");
    expect(result).not.toContain("555-0100");
  });
});
