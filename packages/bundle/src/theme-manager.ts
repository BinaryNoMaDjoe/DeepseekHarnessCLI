import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUILTIN_THEMES,
  DEEPSEEK_DARK,
  validateThemeSpec,
  type ThemeSpec,
} from "@deepseek-harness/tui";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

/**
 * Theme management for the DSHT surface:
 *  - built-ins: deepseek-dark (default) and deepseek-light;
 *  - custom themes: $DSH_HOME/themes/<name>.json (ThemeSpec JSON);
 *  - selection: --theme flag > DSH_TUI_THEME env > $DSH_HOME/tui.json > default.
 */

export const DEFAULT_THEME_NAME = DEEPSEEK_DARK.name;
const CONFIG_FILENAME = "tui.json";

export interface ThemeEntry {
  name: string;
  builtin: boolean;
  mode: string;
}

export class ThemeManager {
  private readonly home: string;

  constructor(home?: string) {
    this.home = home ?? resolveDshHome();
  }

  themesDir(): string {
    return join(this.home, "themes");
  }

  configPath(): string {
    return join(this.home, CONFIG_FILENAME);
  }

  builtins(): Record<string, ThemeSpec> {
    return BUILTIN_THEMES;
  }

  available(): ThemeEntry[] {
    const entries: ThemeEntry[] = Object.values(BUILTIN_THEMES).map((spec) => ({
      name: spec.name,
      builtin: true,
      mode: spec.mode,
    }));
    const dir = this.themesDir();
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const name = file.slice(0, -5);
        const spec = this.load(name);
        if (spec !== null && !(name in BUILTIN_THEMES)) {
          entries.push({ name, builtin: false, mode: spec.mode });
        }
      }
    }
    return entries;
  }

  /** Load a theme by name: built-in first, then the custom file. */
  load(name: string): ThemeSpec | null {
    const builtin = BUILTIN_THEMES[name];
    if (builtin !== undefined) return builtin;
    const file = join(this.themesDir(), name + ".json");
    if (!existsSync(file)) return null;
    try {
      return validateThemeSpec(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      return null;
    }
  }

  /** The effective selection: env override, then the saved config. */
  current(): string {
    const env = process.env.DSH_TUI_THEME;
    if (env !== undefined && env !== "" && this.load(env) !== null) return env;
    try {
      const config = JSON.parse(readFileSync(this.configPath(), "utf8")) as { theme?: unknown };
      if (typeof config.theme === "string" && this.load(config.theme) !== null) return config.theme;
    } catch {
      // missing or corrupt config falls through to the default
    }
    return DEFAULT_THEME_NAME;
  }

  /** Persist a theme selection. Returns false when the name is unknown. */
  set(name: string): boolean {
    if (this.load(name) === null) return false;
    mkdirSync(this.home, { recursive: true });
    writeFileSync(this.configPath(), JSON.stringify({ theme: name }, null, 2) + "\n", "utf8");
    return true;
  }
}
