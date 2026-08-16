import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_THEMES, validateThemeSpec, type ThemeSpec } from "@deepseek-harness/tui";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

/**
 * Theme management for the DSHT surface:
 *  - built-ins: deepseek-dark (default) and deepseek-light;
 *  - custom themes: $DSH_HOME/themes/<name>.json (ThemeSpec JSON);
 *  - selection: --theme flag > DSH_TUI_THEME env > $DSH_HOME/tui.json > default.
 */

export const DEFAULT_THEME_NAME = "auto";
const CONFIG_FILENAME = "tui.json";

export interface ThemeEntry {
  name: string;
  displayName: string;
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
    const entries: ThemeEntry[] = [
      {
        name: "auto",
        displayName: "Auto (跟随终端)",
        builtin: true,
        mode: "auto",
      },
      ...Object.values(BUILTIN_THEMES).map((spec) => ({
        name: spec.name,
        displayName: spec.displayName,
        builtin: true,
        mode: spec.mode,
      })),
    ];
    const dir = this.themesDir();
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const name = file.slice(0, -5);
        const spec = this.load(name);
        if (spec !== null && !(name in BUILTIN_THEMES) && name !== "auto") {
          entries.push({ name, displayName: spec.displayName, builtin: false, mode: spec.mode });
        }
      }
    }
    return entries;
  }

  /** Load a theme by name: built-in first, then the custom file. */
  load(name: string): ThemeSpec | null {
    if (name === "auto") return null; // resolved by the runner via detection
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
    if (env !== undefined && env !== "" && (env === "auto" || this.load(env) !== null)) return env;
    try {
      const config = JSON.parse(readFileSync(this.configPath(), "utf8")) as { theme?: unknown };
      if (
        typeof config.theme === "string" &&
        (config.theme === "auto" || this.load(config.theme) !== null)
      )
        return config.theme;
    } catch {
      // missing or corrupt config falls through to the default
    }
    return DEFAULT_THEME_NAME;
  }

  /** Persist a theme selection. Returns false when the name is unknown. */
  set(name: string): boolean {
    if (name !== "auto" && this.load(name) === null) return false;
    mkdirSync(this.home, { recursive: true });
    writeFileSync(this.configPath(), JSON.stringify({ theme: name }, null, 2) + "\n", "utf8");
    return true;
  }
}
