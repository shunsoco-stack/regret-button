/** Versioned, device-local data. No identifiers or personal data are stored. */
export const STORAGE_KEY = "regret-button:v1";

/** Keep corrupted storage and arithmetic overflow from producing unsafe counts. */
export const MAX_PRESSES = 999_999_999;

export type PressKind = "normal" | "deep";

export type Preferences = {
  sound: boolean;
  haptics: boolean;
  escapeButton: boolean;
  reduceMotion: boolean;
  analytics: boolean;
};

export type RegretRecord = {
  schemaVersion: 1;
  total: number;
  day: string;
  today: number;
  lastPressedAt: string | null;
  deepPresses: number;
  undoUsed: boolean;
  preferences: Preferences;
};

export type RegretMessage = {
  title: string;
  detail: string;
  level: number;
  label: string;
};

export const defaultPreferences: Readonly<Preferences> = Object.freeze({
  sound: false,
  haptics: true,
  escapeButton: true,
  reduceMotion: false,
  analytics: true,
});

function validDate(now: Date): Date {
  return Number.isFinite(now.getTime()) ? now : new Date();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(Math.floor(value), MAX_PRESSES);
}

function normalizePreferences(value: unknown): Preferences {
  const source = isObject(value) ? value : {};
  const preferences = { ...defaultPreferences };

  for (const key of Object.keys(preferences) as (keyof Preferences)[]) {
    if (typeof source[key] === "boolean") {
      preferences[key] = source[key];
    }
  }

  return preferences;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 30) return null;

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;

  // Accept only the canonical format written by recordPress. This also rejects
  // dates such as February 31 that Date would otherwise silently roll forward.
  return parsed.toISOString() === value ? value : null;
}

/** A calendar day in the device's current time zone, deliberately not UTC. */
export function localDayKey(now = new Date()): string {
  const date = validDate(now);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function createInitialRecord(now = new Date()): RegretRecord {
  return {
    schemaVersion: 1,
    total: 0,
    day: localDayKey(now),
    today: 0,
    lastPressedAt: null,
    deepPresses: 0,
    undoUsed: false,
    preferences: { ...defaultPreferences },
  };
}

/**
 * Validate the result of JSON.parse before using it in the UI. Unsupported
 * versions start fresh; a damaged v1 record retains only validated fields.
 * Normalization also clears a stale daily count without changing the lifetime
 * count or the time of the previous press.
 */
export function normalizeRecord(
  value: unknown,
  now = new Date(),
): RegretRecord {
  const initial = createInitialRecord(now);
  if (!isObject(value) || value.schemaVersion !== 1) return initial;

  const total = count(value.total);

  return {
    ...initial,
    total,
    today: value.day === initial.day ? Math.min(count(value.today), total) : 0,
    lastPressedAt: total > 0 ? timestamp(value.lastPressedAt) : null,
    deepPresses: Math.min(count(value.deepPresses), total),
    undoUsed: total > 0 && value.undoUsed === true,
    preferences: normalizePreferences(value.preferences),
  };
}

export function getTodayCount(
  record: RegretRecord,
  now = new Date(),
): number {
  return record.day === localDayKey(now)
    ? Math.min(count(record.today), count(record.total))
    : 0;
}

/** Both normal and deep presses count exactly once. The input is never mutated. */
export function recordPress(
  record: RegretRecord,
  kind: PressKind,
  now = new Date(),
): RegretRecord {
  const date = validDate(now);
  const current = normalizeRecord(record, date);

  return {
    ...current,
    total: Math.min(current.total + 1, MAX_PRESSES),
    today: Math.min(current.today + 1, MAX_PRESSES),
    lastPressedAt: date.toISOString(),
    deepPresses:
      kind === "deep"
        ? Math.min(current.deepPresses + 1, MAX_PRESSES)
        : current.deepPresses,
  };
}

/** The real reset clears all activity, but keeps the user's chosen settings. */
export function resetRecord(
  record: RegretRecord,
  now = new Date(),
): RegretRecord {
  return {
    ...createInitialRecord(now),
    preferences: normalizePreferences(record.preferences),
  };
}

export function getMilestone(total: number): 100 | 500 | 1000 | null {
  return total === 100 || total === 500 || total === 1000 ? total : null;
}

const firstMessages: RegretMessage[] = [
  {
    title: "押さないでください",
    detail: "何も起きないとわかっていても、気になりますよね。",
    level: 0,
    label: "まだ平穏",
  },
  {
    title: "本当に押したんですね",
    detail: "観測を開始しました。起きたことは、それだけです。",
    level: 1,
    label: "小さな後悔",
  },
  {
    title: "戻ることはできません",
    detail: "この瞬間には。カウントは設定からリセットできます。",
    level: 1,
    label: "小さな後悔",
  },
  {
    title: "特に何も起きません",
    detail: "ご安心ください。増えたのは数字だけです。",
    level: 1,
    label: "小さな後悔",
  },
  {
    title: "また押しましたね",
    detail: "ボタンも、少しだけあなたを覚えました。",
    level: 1,
    label: "小さな後悔",
  },
];

const milestoneMessages: Record<100 | 500 | 1000, RegretMessage> = {
  100: {
    title: "100回。何も起きない快挙です。",
    detail: "節目のライトだけ、点けておきます。おつかれさまでした。",
    level: 4,
    label: "100回の後悔",
  },
  500: {
    title: "500回。後悔の熟練者です。",
    detail: "研究所から、何も書かれていない表彰状を。",
    level: 5,
    label: "熟成した後悔",
  },
  1000: {
    title: "1,000回。何も起きない伝説へ。",
    detail: "変わらないボタンに、ささやかな祝福を。ひと休みもどうぞ。",
    level: 5,
    label: "伝説の後悔",
  },
};

type MessageStage = {
  from: number;
  level: number;
  label: string;
  messages: ReadonlyArray<readonly [title: string, detail: string]>;
};

const stages: readonly MessageStage[] = [
  {
    from: 5,
    level: 2,
    label: "気になる後悔",
    messages: [
      ["念のため、何も起きません", "念のための観測が、ひとつ増えました。"],
      ["ボタンと顔なじみですね", "お名前は伺いません。赤いボタンなので。"],
      ["後悔にも、余白を。", "押さない時間も、この実験の一部です。"],
    ],
  },
  {
    from: 25,
    level: 3,
    label: "静かな後悔",
    messages: [
      ["研究員が首をかしげています", "何も起きないことが、順調に確認されています。"],
      ["ここまで来ても、ただのボタンです", "期待を裏切らない、何もなさです。"],
      ["静けさだけが増えていきます", "あとは、カウンターが少し忙しいくらい。"],
    ],
  },
  {
    from: 100,
    level: 4,
    label: "積み重なる後悔",
    messages: [
      ["ボタンに年季が入ってきました", "見た目は新品のまま。後悔だけが積み重なります。"],
      ["後悔が、いい感じに熟成中です", "味見はできません。ボタンなので。"],
      ["記録係も、お茶を淹れました", "どうぞ、あなたもひと休み。数字は逃げません。"],
    ],
  },
  {
    from: 500,
    level: 5,
    label: "熟成した後悔",
    messages: [
      ["もう、ボタンの常連さんです", "いつもの、何も起きない一押しですね。"],
      ["ここまで来たら、小さな研究です", "結論は、最初の一回と同じでした。"],
      ["観測史に、静かな一行が増えました", "本日の発見：赤いボタンは、やっぱり赤い。"],
    ],
  },
  {
    from: 1000,
    level: 5,
    label: "後悔の向こう側",
    messages: [
      ["何も起きない、その先へ", "そこにも、何もありませんでした。"],
      ["今日も、世界はそのままです", "変わったのは、この小さな数字だけ。"],
      ["そろそろ、お茶でもどうですか", "ボタンはここで、静かに待っています。"],
    ],
  },
];

/** Deterministic copy keeps reloading from inventing a new interaction. */
export function getMessage(total: number, deep = false): RegretMessage {
  const presses = count(total);
  const first = firstMessages[presses];

  if (presses === 0) return { ...firstMessages[0] };

  if (deep) {
    return {
      title: "より深い後悔へようこそ",
      detail: "長く押したぶん、静けさが少し深まりました。回数は一回です。",
      level: 5,
      label: "より深い後悔",
    };
  }

  if (first) return { ...first };

  const milestone = getMilestone(presses);
  if (milestone) return { ...milestoneMessages[milestone] };

  const stage = stages.findLast((candidate) => presses >= candidate.from)!;
  const [title, detail] = stage.messages[(presses - stage.from) % stage.messages.length];

  return { title, detail, level: stage.level, label: stage.label };
}
