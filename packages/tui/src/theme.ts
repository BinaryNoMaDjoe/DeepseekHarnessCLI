import chalk, { type ChalkInstance } from "chalk";

/**
 * Theme system. Two built-in base themes express the DeepSeek Harness
 * design language — restrained, premium, high-contrast black and white:
 * distinction comes from weight, dimming, and inversion, not hue.
 * Custom themes are plain JSON ThemeSpec files (any chalk color name or
 * #hex), loaded by the bundle from $DSH_HOME/themes/<name>.json.
 */

export type ThemeMode = "dark" | "light";

export interface ThemeColors {
  /** Main text. */
  primary: string;
  /** Hints, dim text, tool arguments. */
  secondary: string;
  /** User prompts and emphasis. */
  accent: string;
  /** Success markers (✓). */
  success: string;
  /** Error markers (✗); rendered inverted. */
  error: string;
  /** Warning and approval surfaces; rendered inverted. */
  warning: string;
  /** Code blocks. */
  code: string;
  /** Headings. */
  heading: string;
  /** Unified-diff added lines. */
  diffAdd: string;
  /** Unified-diff removed lines. */
  diffDel: string;
  /** Unified-diff context lines. */
  diffContext: string;
}

export interface ThemeSpec {
  name: string;
  mode: ThemeMode;
  /** Background applied to the whole surface; null = terminal default. */
  background: string | null;
  colors: ThemeColors;
}

/** Resolved, callable theme — every token is a styling function. */
export interface ThemeInstance {
  spec: ThemeSpec;
  user(text: string): string;
  local(text: string): string;
  tool(text: string): string;
  ok(text: string): string;
  err(text: string): string;
  secondary(text: string): string;
  reasoning(text: string): string;
  warning(text: string): string;
  code(text: string): string;
  heading(text: string): string;
  diffAdd(text: string): string;
  diffDel(text: string): string;
  diffContext(text: string): string;
  inverted(text: string): string;
}

/** The default dark theme: monochrome, high contrast, restrained. */
export const DEEPSEEK_DARK: ThemeSpec = {
  name: "deepseek-dark",
  mode: "dark",
  background: null,
  colors: {
    primary: "white",
    secondary: "gray",
    accent: "white",
    success: "white",
    error: "white",
    warning: "white",
    code: "white",
    heading: "white",
    diffAdd: "white",
    diffDel: "gray",
    diffContext: "gray",
  },
};

/** The light counterpart: white surface, black text. */
export const DEEPSEEK_LIGHT: ThemeSpec = {
  name: "deepseek-light",
  mode: "light",
  background: "white",
  colors: {
    primary: "black",
    secondary: "gray",
    accent: "black",
    success: "black",
    error: "black",
    warning: "black",
    code: "black",
    heading: "black",
    diffAdd: "black",
    diffDel: "gray",
    diffContext: "gray",
  },
};

export const BUILTIN_THEMES: Record<string, ThemeSpec> = {
  [DEEPSEEK_DARK.name]: DEEPSEEK_DARK,
  [DEEPSEEK_LIGHT.name]: DEEPSEEK_LIGHT,
};

const COLOR_KEYS: (keyof ThemeColors)[] = [
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

/**
 * Validate untrusted theme JSON into a ThemeSpec; returns null on any
 * violation so callers can fall back to a built-in theme.
 */
export function validateThemeSpec(input: unknown): ThemeSpec | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as { name?: unknown; mode?: unknown; background?: unknown; colors?: unknown };
  if (typeof raw.name !== "string" || raw.name.trim() === "") return null;
  if (raw.mode !== "dark" && raw.mode !== "light") return null;
  if (raw.background !== null && typeof raw.background !== "string") return null;
  if (typeof raw.colors !== "object" || raw.colors === null) return null;
  const colors = raw.colors as Record<string, unknown>;
  for (const key of COLOR_KEYS) {
    if (typeof colors[key] !== "string" || (colors[key] as string).trim() === "") return null;
  }
  return {
    name: raw.name,
    mode: raw.mode,
    background: raw.background as string | null,
    colors: Object.fromEntries(
      COLOR_KEYS.map((key) => [key, colors[key] as string]),
    ) as unknown as ThemeColors,
  };
}

/** Resolve a color spec (chalk keyword or #hex) to a chalk instance. */
function toStyle(value: string): ChalkInstance {
  if (value.startsWith("#")) return chalk.hex(value);
  const style = (chalk as unknown as Record<string, ChalkInstance>)[value];
  if (style !== undefined) return style;
  return chalk; // never crash on an unknown color name
}

/** Compile a ThemeSpec into callable tokens. */
export function buildTheme(spec: ThemeSpec): ThemeInstance {
  const colors = Object.fromEntries(
    COLOR_KEYS.map((key) => [key, toStyle(spec.colors[key])]),
  ) as Record<keyof ThemeColors, ChalkInstance>;

  const invertedStyle = spec.mode === "light" ? chalk.white.bgBlack : chalk.black.bgWhite;

  const inverted = (text: string): string => invertedStyle(text);

  return {
    spec,
    user: (text) => colors.accent.bold(text),
    local: (text) => colors.secondary(text),
    tool: (text) => colors.primary.bold(text),
    ok: (text) => colors.success(text),
    err: inverted,
    secondary: (text) => colors.secondary.dim(text),
    reasoning: (text) => colors.secondary.italic(text),
    warning: inverted,
    code: (text) => colors.code(text),
    heading: (text) => colors.heading.bold(text),
    diffAdd: (text) => colors.diffAdd.bold(text),
    diffDel: (text) => colors.diffDel.strikethrough(text),
    diffContext: (text) => colors.diffContext.dim(text),
    inverted,
  };
}

/** The instance every surface falls back to. */
export const DEFAULT_THEME = buildTheme(DEEPSEEK_DARK);
