import { describe, expect, it } from "vitest";
import {
  MAX_PRESSES,
  createInitialRecord,
  defaultPreferences,
  getMessage,
  getMilestone,
  getTodayCount,
  localDayKey,
  normalizeRecord,
  recordPress,
  resetRecord,
  type RegretRecord,
} from "../src/lib/regret";

const now = new Date(2026, 7, 27, 12, 34, 56);

function savedRecord(overrides: Partial<RegretRecord> = {}): RegretRecord {
  return {
    ...createInitialRecord(now),
    total: 12,
    today: 4,
    lastPressedAt: new Date(2026, 7, 27, 11, 30, 0).toISOString(),
    deepPresses: 2,
    ...overrides,
  };
}

describe("local records", () => {
  it("creates independent settings so changing one record cannot change the defaults", () => {
    const first = createInitialRecord(now);
    const second = createInitialRecord(now);
    first.preferences.sound = true;

    expect(second.preferences.sound).toBe(false);
    expect(defaultPreferences.sound).toBe(false);
    expect(first.total).toBe(0);
    expect(first.lastPressedAt).toBeNull();
  });

  it("uses the local calendar at both sides of midnight", () => {
    const before = new Date(2026, 7, 27, 23, 59, 59);
    const after = new Date(2026, 7, 28, 0, 0, 0);

    expect(localDayKey(before)).toBe("2026-08-27");
    expect(localDayKey(after)).toBe("2026-08-28");
  });

  it("shows zero on a new day without mutating the old record", () => {
    const record = savedRecord();
    const tomorrow = new Date(2026, 7, 28, 0, 0, 0);

    expect(getTodayCount(record, now)).toBe(4);
    expect(getTodayCount(record, tomorrow)).toBe(0);
    expect(record.today).toBe(4);
    expect(record.day).toBe("2026-08-27");
  });

  it("starts a new daily count on the first press after midnight", () => {
    const record = savedRecord({ undoUsed: true });
    const tomorrow = new Date(2026, 7, 28, 0, 0, 0);
    const next = recordPress(record, "normal", tomorrow);

    expect(next).toMatchObject({
      total: 13,
      today: 1,
      day: "2026-08-28",
      lastPressedAt: tomorrow.toISOString(),
      deepPresses: 2,
      undoUsed: true,
    });
    expect(record.total).toBe(12);
  });

  it("counts a normal press once and preserves unrelated state", () => {
    const record = savedRecord({ undoUsed: true });
    record.preferences.sound = true;
    const next = recordPress(record, "normal", now);

    expect(next.total).toBe(13);
    expect(next.today).toBe(5);
    expect(next.lastPressedAt).toBe(now.toISOString());
    expect(next.deepPresses).toBe(2);
    expect(next.undoUsed).toBe(true);
    expect(next.preferences).toEqual(record.preferences);
    expect(next.preferences).not.toBe(record.preferences);
  });

  it("counts a long press as one total press and one deep press", () => {
    const record = savedRecord();
    const next = recordPress(record, "deep", now);

    expect(next.total - record.total).toBe(1);
    expect(next.today - record.today).toBe(1);
    expect(next.deepPresses - record.deepPresses).toBe(1);
    expect(record.deepPresses).toBe(2);
  });

  it("saturates safely at the maximum count without stopping timestamp updates", () => {
    const record = savedRecord({
      total: MAX_PRESSES,
      today: MAX_PRESSES,
      deepPresses: MAX_PRESSES,
    });
    const next = recordPress(record, "deep", now);

    expect(next.total).toBe(MAX_PRESSES);
    expect(next.today).toBe(MAX_PRESSES);
    expect(next.deepPresses).toBe(MAX_PRESSES);
    expect(next.lastPressedAt).toBe(now.toISOString());
  });

  it("really resets all activity and the one-time undo while retaining every setting", () => {
    const record = savedRecord({
      undoUsed: true,
      preferences: {
        sound: true,
        haptics: false,
        escapeButton: false,
        reduceMotion: true,
        analytics: false,
      },
    });
    const tomorrow = new Date(2026, 7, 28, 12, 0, 0);
    const reset = resetRecord(record, tomorrow);

    expect(reset).toEqual({
      ...createInitialRecord(tomorrow),
      preferences: record.preferences,
    });
    expect(reset.preferences).not.toBe(record.preferences);
    expect(record.total).toBe(12);
    expect(record.undoUsed).toBe(true);
  });
});

describe("storage validation", () => {
  it.each([null, undefined, [], "broken JSON", 42, {}, { schemaVersion: 0 }, { schemaVersion: 2 }])(
    "falls back to a fresh record for corrupt or unsupported input: %j",
    (value) => {
      expect(normalizeRecord(value, now)).toEqual(createInitialRecord(now));
    },
  );

  it("round-trips a valid record and returns a fresh copy", () => {
    const original = savedRecord({ undoUsed: true });
    const normalized = normalizeRecord(JSON.parse(JSON.stringify(original)), now);

    expect(normalized).toEqual(original);
    expect(normalized).not.toBe(original);
    expect(normalizeRecord(normalized, now)).toEqual(normalized);
  });

  it("clears an expired daily count but retains lifetime history", () => {
    const yesterday = savedRecord({ day: "2026-08-26" });
    const normalized = normalizeRecord(yesterday, now);

    expect(normalized.today).toBe(0);
    expect(normalized.day).toBe("2026-08-27");
    expect(normalized.total).toBe(yesterday.total);
    expect(normalized.lastPressedAt).toBe(yesterday.lastPressedAt);
  });

  it.each(["2026-02-31", "invalid", null, "2026-08-28"])(
    "does not attribute counts from an invalid or different day to today: %j",
    (day) => {
      expect(normalizeRecord({ ...savedRecord(), day }, now).today).toBe(0);
    },
  );

  it.each([Number.NaN, Infinity, -Infinity, -1, "25", null, {}, []])(
    "rejects dangerous or nonnumeric counts: %j",
    (total) => {
      const record = normalizeRecord({ ...savedRecord({ undoUsed: true }), total }, now);

      expect(record.total).toBe(0);
      expect(record.today).toBe(0);
      expect(record.deepPresses).toBe(0);
      expect(record.lastPressedAt).toBeNull();
      expect(record.undoUsed).toBe(false);
    },
  );

  it("floors fractions, caps large counts, and keeps component counts below total", () => {
    expect(
      normalizeRecord({ ...savedRecord(), total: Number.MAX_VALUE, today: Infinity }, now),
    ).toMatchObject({ total: MAX_PRESSES, today: 0 });

    expect(
      normalizeRecord({ ...savedRecord(), total: 3.9, today: 100, deepPresses: 20 }, now),
    ).toMatchObject({ total: 3, today: 3, deepPresses: 3 });
  });

  it("uses only boolean preferences and does not copy unknown stored fields", () => {
    const record = normalizeRecord(
      {
        ...savedRecord(),
        undoUsed: "yes",
        preferences: {
          sound: "false",
          haptics: false,
          escapeButton: 0,
          reduceMotion: true,
          analytics: false,
          unknown: "not retained",
        },
        unknown: "not retained",
      },
      now,
    );

    expect(record.preferences).toEqual({
      sound: false,
      haptics: false,
      escapeButton: true,
      reduceMotion: true,
      analytics: false,
    });
    expect(record.undoUsed).toBe(false);
    expect(record).not.toHaveProperty("unknown");
  });

  it.each([null, {}, [], "enabled"])(
    "recovers default settings when the preferences object is corrupt: %j",
    (preferences) => {
      expect(normalizeRecord({ ...savedRecord(), preferences }, now).preferences).toEqual(
        defaultPreferences,
      );
    },
  );

  it.each(["not a date", "2026-08-27", "2026-02-31T00:00:00.000Z", Infinity, {}])(
    "removes malformed previous-press timestamps: %j",
    (lastPressedAt) => {
      expect(normalizeRecord({ ...savedRecord(), lastPressedAt }, now).lastPressedAt).toBeNull();
    },
  );

  it("retains valid timestamps after a device clock change", () => {
    const future = new Date(2026, 7, 28, 12, 0, 0).toISOString();
    expect(normalizeRecord(savedRecord({ lastPressedAt: future }), now).lastPressedAt).toBe(
      future,
    );
  });

  it("recovers from an invalid Date argument without throwing", () => {
    expect(() => recordPress(createInitialRecord(now), "normal", new Date(NaN))).not.toThrow();
  });
});

describe("messages and milestones", () => {
  it.each([100, 500, 1000] as const)("recognizes only the exact %i milestone", (milestone) => {
    expect(getMilestone(milestone - 1)).toBeNull();
    expect(getMilestone(milestone)).toBe(milestone);
    expect(getMilestone(milestone + 1)).toBeNull();
    expect(getMilestone(milestone + 0.5)).toBeNull();
  });

  it("reaches a milestone when the boundary press is a long press", () => {
    const record = savedRecord({ total: 99 });
    const next = recordPress(record, "deep", now);

    expect(next.total).toBe(100);
    expect(getMilestone(next.total)).toBe(100);
    expect(getMessage(next.total, true).label).toBe("より深い後悔");
  });

  it("uses the requested first four responses in order", () => {
    expect([1, 2, 3, 4].map((total) => getMessage(total).title)).toEqual([
      "本当に押したんですね",
      "戻ることはできません",
      "特に何も起きません",
      "また押しましたね",
    ]);
  });

  it("returns the initial message for zero and corrupt counts", () => {
    expect(getMessage(0).title).toBe("押さないでください");
    expect(getMessage(NaN)).toEqual(getMessage(0));
    expect(getMessage(-1)).toEqual(getMessage(0));
  });

  it("has a distinct deep-mode response while still explaining the single count", () => {
    const message = getMessage(1, true);
    expect(message.title).toContain("深い後悔");
    expect(message.detail).toContain("回数は一回");
    expect(message.title).not.toBe(getMessage(1).title);
  });

  it("escalates through the normal stages and provides copy at all tested counts", () => {
    const counts = [0, 1, 4, 5, 24, 25, 99, 100, 101, 499, 500, 999, 1000, 1001, MAX_PRESSES];
    const messages = counts.map((total) => getMessage(total));
    const levels = messages.map((message) => message.level);

    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const message of messages) {
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.detail.length).toBeGreaterThan(0);
      expect(message.label.length).toBeGreaterThan(0);
    }
  });

  it("returns independent message objects", () => {
    const first = getMessage(100);
    first.title = "changed";
    expect(getMessage(100).title).not.toBe("changed");
  });
});
