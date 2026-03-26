import { describe, it, expect } from "vitest";
import { formatDateTime, formatShortDate } from "../utils/dates.js";

describe("formatDateTime", () => {
  it("formats Date objects", () => {
    const d = new Date("2024-06-15T14:30:00Z");
    const result = formatDateTime(d);
    expect(result).toMatch(/2024-06-15/);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("formats ISO string input", () => {
    const result = formatDateTime("2024-06-15T14:30:00Z");
    expect(result).toMatch(/2024-06-15/);
  });
});

describe("formatShortDate", () => {
  it("formats as short date", () => {
    const d = new Date("2024-01-15T00:00:00Z");
    const result = formatShortDate(d);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("accepts string input", () => {
    const result = formatShortDate("2024-12-25T00:00:00Z");
    expect(result).toContain("Dec");
    expect(result).toContain("25");
  });
});
