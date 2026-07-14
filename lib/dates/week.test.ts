import { describe, expect, it } from "vitest";
import { singularizeNoun } from "@/lib/grocery/singularize";
import { startOfWeek, isValidDate, toDateString } from "@/lib/dates/week";

describe("singularizeNoun", () => {
  it("singularizes common plurals", () => {
    expect(singularizeNoun("apples")).toBe("apple");
    expect(singularizeNoun("tomatoes")).toBe("tomato");
    expect(singularizeNoun("onions")).toBe("onion");
    expect(singularizeNoun("peaches")).toBe("peach");
    // "berries" is in KEEP_AS_IS (ingredient names like "mixed berries")
    expect(singularizeNoun("berries")).toBe("berries");
  });

  it("keeps known always-plural-looking words", () => {
    expect(singularizeNoun("oats")).toBe("oats");
    expect(singularizeNoun("greens")).toBe("greens");
  });
});

describe("week helpers", () => {
  it("anchors to Monday", () => {
    // 2026-07-15 is a Wednesday
    const mon = startOfWeek(new Date("2026-07-15T12:00:00"));
    expect(toDateString(mon)).toBe("2026-07-13");
  });

  it("validates YYYY-MM-DD", () => {
    expect(isValidDate("2026-07-13")).toBe(true);
    expect(isValidDate("not-a-date")).toBe(false);
    expect(isValidDate("2026-13-40")).toBe(false);
  });
});
