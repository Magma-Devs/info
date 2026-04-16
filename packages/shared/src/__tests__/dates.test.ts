import { describe, it, expect } from "vitest";
import { formatDateTime, formatShortDate, parseYMD } from "../utils/dates.js";

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

describe("parseYMD", () => {
  it("parses valid YYYY-MM-DD as UTC midnight", () => {
    const d = parseYMD("2025-06-17");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2025-06-17T00:00:00.000Z");
  });

  it("rejects non-matching formats", () => {
    expect(parseYMD("2025/06/17")).toBeNull();
    expect(parseYMD("2025-06-17T00:00:00Z")).toBeNull();
    expect(parseYMD("06-17-2025")).toBeNull();
    expect(parseYMD("")).toBeNull();
    expect(parseYMD("junk")).toBeNull();
  });

  it("rejects calendar-invalid dates", () => {
    expect(parseYMD("2025-02-30")).toBeNull(); // no Feb 30
    expect(parseYMD("2025-13-01")).toBeNull(); // no month 13
    expect(parseYMD("2025-00-01")).toBeNull(); // no month 0
    expect(parseYMD("2025-06-32")).toBeNull(); // no day 32
    expect(parseYMD("2025-06-00")).toBeNull(); // no day 0
  });

  it("accepts Feb 29 on leap years only", () => {
    expect(parseYMD("2024-02-29")).not.toBeNull();
    expect(parseYMD("2025-02-29")).toBeNull();
  });
});
