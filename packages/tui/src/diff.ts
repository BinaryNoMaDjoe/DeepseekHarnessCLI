/**
 * Diff support for the TUI:
 *  - unifiedDiff(before, after) computes a minimal line diff (LCS);
 *  - parseDiff(text) renders an existing unified-diff string into rows;
 *  - diffWords(oldLine, newLine) computes intra-line changed words for
 *    Claude-style word-level highlighting on replaced lines.
 */

export interface DiffLine {
  kind: "context" | "add" | "del";
  text: string;
}

export interface WordSegment {
  kind: "add" | "del" | "same";
  text: string;
}

type Op = { kind: "del" } | { kind: "add"; indexB: number } | { kind: "same"; indexB: number };

export function unifiedDiff(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 1_000_000) {
    return [
      ...a.map((text) => ({ kind: "del" as const, text })),
      ...b.map((text) => ({ kind: "add" as const, text })),
    ];
  }
  const ops = lcsOps(a, b);
  const rows: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  for (const op of ops) {
    if (op.kind === "same") {
      rows.push({ kind: "context", text: a[ai]! });
      ai++;
      bi++;
    } else if (op.kind === "del") {
      rows.push({ kind: "del", text: a[ai]! });
      ai++;
    } else {
      rows.push({ kind: "add", text: b[bi]! });
      bi++;
    }
  }
  return withContext(rows, context);
}

/** Linear-memory LCS producing an op sequence. */
function lcsOps(a: string[], b: string[]): Op[] {
  const m = b.length;
  const prev = new Uint32Array(m + 1);
  const curr = new Uint32Array(m + 1);
  const backtrack: Int32Array[] = [];
  for (let i = 1; i <= a.length; i++) {
    const row = new Int32Array(m + 1);
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]! + 1;
        row[j] = 0;
      } else if ((prev[j] ?? 0) >= (curr[j - 1] ?? 0)) {
        curr[j] = prev[j] ?? 0;
        row[j] = 1;
      } else {
        curr[j] = curr[j - 1] ?? 0;
        row[j] = 2;
      }
    }
    prev.set(curr);
    backtrack.push(row);
  }
  const ops: Op[] = [];
  let i = a.length;
  let j = m;
  while (i > 0 || j > 0) {
    if (i === 0) {
      ops.push({ kind: "add", indexB: j - 1 });
      j--;
      continue;
    }
    if (j === 0) {
      ops.push({ kind: "del" });
      i--;
      continue;
    }
    const code = backtrack[i - 1]![j]!;
    if (code === 0) {
      ops.push({ kind: "same", indexB: j - 1 });
      i--;
      j--;
    } else if (code === 1) {
      ops.push({ kind: "del" });
      i--;
    } else {
      ops.push({ kind: "add", indexB: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/** Trim long runs of context lines around changes. */
function withContext(rows: DiffLine[], context: number): DiffLine[] {
  const changed = rows.map((row) => row.kind !== "context");
  if (changed.every((flag) => !flag)) return rows;
  const keep = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    if (!changed[i]) continue;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++)
      keep.add(j);
  }
  const out: DiffLine[] = [];
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    if (keep.has(i)) {
      if (out.length > 0 && last !== i - 1) out.push({ kind: "context", text: "…" });
      out.push(rows[i]!);
      last = i;
    }
  }
  return out;
}

const HUNK_HEADER = /^@@ /;

/**
 * Parse an existing unified-diff string into rows. Non-diff lines are kept
 * as context; + and - lines become add/del rows.
 */
export function parseDiff(text: string): DiffLine[] {
  const rows: DiffLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    if (line.startsWith("+++") || line.startsWith("---") || HUNK_HEADER.test(line)) continue;
    if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "del", text: line.slice(1) });
    else rows.push({ kind: "context", text: line });
  }
  return rows;
}

/** True when the text looks like a unified diff at a glance. */
export function looksLikeDiff(text: string): boolean {
  const head = text.split("\n").slice(0, 6);
  return head.some((line) => /^\+{3} /.test(line) || /^-{3} /.test(line) || /^@@ /.test(line));
}

/**
 * Intra-line word diff: split both lines into words and run the same LCS
 * over word tokens. Used to bold the changed words inside a replaced line.
 */
export function diffWords(oldLine: string, newLine: string): WordSegment[] {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  const ops = lcsOps(oldWords, newWords);
  const out: WordSegment[] = [];
  let ai = 0;
  let bi = 0;
  const pushText = (kind: WordSegment["kind"], text: string): void => {
    if (text === "") return;
    const last = out.at(-1);
    if (last !== undefined && last.kind === kind)
      out[out.length - 1] = { kind, text: last.text + text };
    else out.push({ kind, text });
  };
  for (const op of ops) {
    if (op.kind === "same") {
      pushText("same", oldWords[ai] ?? "");
      ai++;
      bi++;
    } else if (op.kind === "del") {
      pushText("del", oldWords[ai] ?? "");
      ai++;
    } else {
      pushText("add", newWords[bi] ?? "");
      bi++;
    }
  }
  return out;
}
