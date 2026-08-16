import chalk, { type ChalkInstance } from "chalk";

/**
 * DSHT color system v2 — combines the engineering of Kimi Code's palette
 * (semantic tokens, four-level text hierarchy, WCAG discipline) and
 * Claude Code's (line+word diff tokens, shimmer variants, daltonized
 * themes, subagent identity hues).
 *
 * Brand rule: DeepSeek Harness is BLACK AND WHITE. The monochrome text
 * hierarchy, borders, focus, and user-role styling ARE the brand. Color
 * appears only where it carries functional meaning: diff, success,
 * failure, warning, and subagent identity.
 */

export type ThemeMode = "dark" | "light";

export interface ColorPalette {
  primary: string;
  accent: string;
  text: string;
  textStrong: string;
  textDim: string;
  textMuted: string;
  border: string;
  borderFocus: string;
  success: string;
  warning: string;
  error: string;
  diffAddedBg: string;
  diffRemovedBg: string;
  diffAdded: string;
  diffRemoved: string;
  diffGutter: string;
  diffMeta: string;
  roleUser: string;
  shellMode: string;
  agentRed: string;
  agentBlue: string;
  agentGreen: string;
  agentYellow: string;
  agentPurple: string;
  agentOrange: string;
  agentPink: string;
  agentCyan: string;
  shimmer: string;
}

export interface ThemeSpec {
  name: string;
  displayName: string;
  mode: ThemeMode;
  background: string | null;
  colors: ColorPalette;
}

export interface ThemeInstance {
  spec: ThemeSpec;
  primary(text: string): string;
  accent(text: string): string;
  text(text: string): string;
  strong(text: string): string;
  dim(text: string): string;
  muted(text: string): string;
  border(text: string): string;
  borderFocus(text: string): string;
  success(text: string): string;
  warning(text: string): string;
  error(text: string): string;
  diffAddedBg(text: string): string;
  diffRemovedBg(text: string): string;
  diffAdded(text: string): string;
  diffRemoved(text: string): string;
  diffGutter(text: string): string;
  diffMeta(text: string): string;
  user(text: string): string;
  agentHue(index: number, text: string): string;
  shimmer(text: string): string;
  inverted(text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  inlineCode(text: string): string;
}

export const AGENT_HUE_KEYS = [
  "agentRed",
  "agentBlue",
  "agentGreen",
  "agentYellow",
  "agentPurple",
  "agentOrange",
  "agentPink",
  "agentCyan",
] as const;

const DARK: ColorPalette = {
  primary: "#FFFFFF",
  accent: "#FFFFFF",
  text: "#E8E8E8",
  textStrong: "#FFFFFF",
  textDim: "#9A9A9A",
  textMuted: "#6E6E6E",
  border: "#5A5A5A",
  borderFocus: "#FFFFFF",
  success: "#4EC87E",
  warning: "#E8A838",
  error: "#E85454",
  diffAddedBg: "#22462B",
  diffRemovedBg: "#7A2936",
  diffAdded: "#4EC87E",
  diffRemoved: "#E85454",
  diffGutter: "#6E6E6E",
  diffMeta: "#9A9A9A",
  roleUser: "#FFFFFF",
  shellMode: "#FFFFFF",
  agentRed: "#DC2626",
  agentBlue: "#2563EB",
  agentGreen: "#16A34A",
  agentYellow: "#CA8A04",
  agentPurple: "#9333EA",
  agentOrange: "#EA580C",
  agentPink: "#DB2777",
  agentCyan: "#0891B2",
  shimmer: "#B8B8B8",
};

const LIGHT: ColorPalette = {
  primary: "#000000",
  accent: "#000000",
  text: "#1A1A1A",
  textStrong: "#000000",
  textDim: "#4A4A4A",
  textMuted: "#666666",
  border: "#737373",
  borderFocus: "#000000",
  success: "#0E7A38",
  warning: "#92660A",
  error: "#B91C1C",
  diffAddedBg: "#E6F4EA",
  diffRemovedBg: "#FDE8E8",
  diffAdded: "#0E7A38",
  diffRemoved: "#B91C1C",
  diffGutter: "#666666",
  diffMeta: "#4A4A4A",
  roleUser: "#000000",
  shellMode: "#000000",
  agentRed: "#B91C1C",
  agentBlue: "#1D4ED8",
  agentGreen: "#15803D",
  agentYellow: "#A16207",
  agentPurple: "#7E22CE",
  agentOrange: "#C2410C",
  agentPink: "#BE185D",
  agentCyan: "#0E7490",
  shimmer: "#525252",
};

const DARK_DALTONIZED: ColorPalette = {
  ...DARK,
  success: "#66B2FF",
  warning: "#FFD166",
  diffAddedBg: "#123B5C",
  diffRemovedBg: "#5C1212",
  diffAdded: "#66B2FF",
  diffRemoved: "#FF9999",
};

const LIGHT_DALTONIZED: ColorPalette = {
  ...LIGHT,
  success: "#0066CC",
  warning: "#8A6400",
  diffAddedBg: "#D6E9F8",
  diffRemovedBg: "#F8D6D6",
  diffAdded: "#0066CC",
  diffRemoved: "#CC3333",
};

export const DEEPSEEK_DARK: ThemeSpec = {
  name: "deepseek-dark",
  displayName: "DeepSeek Dark",
  mode: "dark",
  background: null,
  colors: DARK,
};

export const DEEPSEEK_LIGHT: ThemeSpec = {
  name: "deepseek-light",
  displayName: "DeepSeek Light",
  mode: "light",
  background: "white",
  colors: LIGHT,
};

export const DEEPSEEK_DARK_DALTONIZED: ThemeSpec = {
  name: "deepseek-dark-daltonized",
  displayName: "DeepSeek Dark (Daltonized)",
  mode: "dark",
  background: null,
  colors: DARK_DALTONIZED,
};

export const DEEPSEEK_LIGHT_DALTONIZED: ThemeSpec = {
  name: "deepseek-light-daltonized",
  displayName: "DeepSeek Light (Daltonized)",
  mode: "light",
  background: "white",
  colors: LIGHT_DALTONIZED,
};

export const BUILTIN_THEMES: Record<string, ThemeSpec> = {
  [DEEPSEEK_DARK.name]: DEEPSEEK_DARK,
  [DEEPSEEK_LIGHT.name]: DEEPSEEK_LIGHT,
  [DEEPSEEK_DARK_DALTONIZED.name]: DEEPSEEK_DARK_DALTONIZED,
  [DEEPSEEK_LIGHT_DALTONIZED.name]: DEEPSEEK_LIGHT_DALTONIZED,
};

const COLOR_KEYS = Object.keys(DARK) as (keyof ColorPalette)[];

export const DEFAULT_THEME_NAME = DEEPSEEK_DARK.name;

/**
 * Validate a custom theme. Two shapes are accepted:
 *  - v2: {name, displayName?, base: dark|light, colors: partial};
 *  - v1 (legacy): {name, mode, background, colors: 11 full keys}.
 * Returns null on any violation; callers fall back to a built-in theme.
 */
export function validateThemeSpec(input: unknown): ThemeSpec | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as {
    name?: unknown;
    displayName?: unknown;
    base?: unknown;
    mode?: unknown;
    background?: unknown;
    colors?: unknown;
  };
  if (typeof raw.name !== "string" || raw.name.trim() === "") return null;

  if (raw.base === "dark" || raw.base === "light") {
    if (typeof raw.colors !== "object" || raw.colors === null) return null;
    const overrides = raw.colors as Record<string, unknown>;
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
      if (!(key in DARK)) return null;
    }
    const base = raw.base === "dark" ? DARK : LIGHT;
    return {
      name: raw.name,
      displayName: typeof raw.displayName === "string" ? raw.displayName : raw.name,
      mode: raw.base,
      background: raw.base === "light" ? "white" : null,
      colors: { ...base, ...(overrides as Partial<ColorPalette>) } as ColorPalette,
    };
  }

  if (raw.mode === "dark" || raw.mode === "light") {
    if (typeof raw.colors !== "object" || raw.colors === null) return null;
    const old = raw.colors as Record<string, unknown>;
    const legacyKeys = [
      "primary",
      "secondary",
      "accent",
      "success",
      "error",
      "warning",
      "code",
      "heading",
      "diffAdd",
      "diffDel",
      "diffContext",
    ];
    for (const key of legacyKeys) {
      if (typeof old[key] !== "string" || (old[key] as string).trim() === "") return null;
    }
    const base = raw.mode === "dark" ? { ...DARK } : { ...LIGHT };
    const mapped: Partial<ColorPalette> = {
      text: old["primary"] as string,
      textDim: old["secondary"] as string,
      textStrong: old["accent"] as string,
      primary: old["accent"] as string,
      success: old["success"] as string,
      error: old["error"] as string,
      warning: old["warning"] as string,
      textMuted: old["secondary"] as string,
      diffAdded: old["diffAdd"] as string,
      diffRemoved: old["diffDel"] as string,
      diffMeta: old["diffContext"] as string,
    };
    return {
      name: raw.name,
      displayName: raw.name,
      mode: raw.mode,
      background: (raw.background as string | null) ?? null,
      colors: { ...base, ...mapped } as ColorPalette,
    };
  }

  return null;
}

function toStyle(value: string): ChalkInstance {
  if (value.startsWith("#")) return chalk.hex(value);
  return chalk;
}

function bgStyle(value: string): ChalkInstance {
  if (value.startsWith("#")) return chalk.bgHex(value);
  return chalk;
}

/** Compile a ThemeSpec into callable tokens. */
export function buildTheme(spec: ThemeSpec): ThemeInstance {
  const c = Object.fromEntries(
    COLOR_KEYS.map((key) => [key, toStyle(spec.colors[key])]),
  ) as unknown as Record<keyof ColorPalette, ChalkInstance>;
  const cBg = Object.fromEntries(
    (["diffAddedBg", "diffRemovedBg"] as const).map((key) => [key, bgStyle(spec.colors[key])]),
  ) as unknown as { diffAddedBg: ChalkInstance; diffRemovedBg: ChalkInstance };

  const invertedStyle = spec.mode === "light" ? chalk.white.bgBlack : chalk.black.bgWhite;

  return {
    spec,
    primary: (text: string) => c.primary.bold(text),
    accent: (text: string) => c.accent.bold(text),
    text: (text: string) => c.text(text),
    strong: (text: string) => c.textStrong.bold(text),
    dim: (text: string) => c.textDim.dim(text),
    muted: (text: string) => c.textMuted(text),
    border: (text: string) => c.border(text),
    borderFocus: (text: string) => c.borderFocus.bold(text),
    success: (text: string) => c.success(text),
    warning: (text: string) => c.warning(text),
    error: (text: string) => c.error(text),
    diffAddedBg: (text: string) => cBg.diffAddedBg(text),
    diffRemovedBg: (text: string) => cBg.diffRemovedBg(text),
    diffAdded: (text: string) => c.diffAdded.bold(text),
    diffRemoved: (text: string) => c.diffRemoved.bold(text),
    diffGutter: (text: string) => c.diffGutter(text),
    diffMeta: (text: string) => c.diffMeta.dim(text),
    user: (text: string) => c.roleUser.bold(text),
    agentHue: (index: number, text: string) => {
      const key = AGENT_HUE_KEYS[index % AGENT_HUE_KEYS.length]!;
      return c[key](text);
    },
    shimmer: (text: string) => c.shimmer(text),
    inverted: (text: string) => invertedStyle(text),
    bold: (text: string) => c.textStrong.bold(text),
    italic: (text: string) => c.textDim.italic(text),
    inlineCode: (text: string) => c.textStrong.bold(text),
  };
}

export const DEFAULT_THEME = buildTheme(DEEPSEEK_DARK);

/* eslint-disable no-control-regex -- OSC/CSI terminal probes are the point */
/**
 * Probe the terminal for its color scheme (OSC 11 background + OSC 997
 * color-scheme report). Used to resolve the auto theme. Must run BEFORE
 * Ink attaches to stdin; non-fatal on timeout.
 */
export async function detectTerminalScheme(timeoutMs = 400): Promise<"dark" | "light" | null> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) return null;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: "dark" | "light" | null): void => {
      if (settled) return;
      settled = true;
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve(value);
    };
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString();
      const schemeMatch = /\x1b\[\?997;(1|2)n/.exec(text);
      if (schemeMatch !== null) {
        finish(schemeMatch[1] === "2" ? "light" : "dark");
        return;
      }
      const bgMatch = /\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)/i.exec(text);
      if (bgMatch !== null) {
        const value = bgMatch[1]!.trim().toLowerCase();
        if (value.startsWith("rgb:")) {
          const parts = value.slice(4).split("/");
          const r = Number.parseInt(parts[0] ?? "0", 16);
          const g = Number.parseInt(parts[1] ?? "0", 16);
          const b = Number.parseInt(parts[2] ?? "0", 16);
          finish(r + g + b > 384 ? "light" : "dark");
          return;
        }
      }
    };
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onData);
      process.stdout.write("\x1b]11;?\x07");
      process.stdout.write("\x1b[?997n");
    } catch {
      finish(null);
      return;
    }
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref?.();
  });
}
