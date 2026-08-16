import { describe, expect, it, beforeAll } from "vitest";
import chalk from "chalk";
import {
  buildTheme,
  DEEPSEEK_DARK,
  DEEPSEEK_DARK_DALTONIZED,
  DEEPSEEK_LIGHT,
  validateThemeSpec,
} from "../src/theme.js";

beforeAll(() => {
  chalk.level = 3;
});

describe("validateThemeSpec v2", () => {
  it("accepts base + partial overrides and falls back to the base", () => {
    const spec = validateThemeSpec({
      name: "custom",
      displayName: "Custom",
      base: "dark",
      colors: { primary: "#CCCCCC", text: "#FFFFFF" },
    });
    expect(spec?.colors.primary).toBe("#CCCCCC");
    expect(spec?.colors.text).toBe("#FFFFFF");
    expect(spec?.colors.success).toBe(DEEPSEEK_DARK.colors.success);
    expect(spec?.displayName).toBe("Custom");
  });

  it("rejects invalid hex, unknown keys, and bad shapes", () => {
    expect(
      validateThemeSpec({
        name: "x",
        base: "dark",
        colors: { primary: "red" },
      }),
    ).toBeNull();
    expect(
      validateThemeSpec({
        name: "x",
        base: "dark",
        colors: { notAToken: "#123456" },
      }),
    ).toBeNull();
    expect(validateThemeSpec(null)).toBeNull();
    expect(validateThemeSpec({ name: "", base: "dark", colors: {} })).toBeNull();
  });

  it("still accepts the legacy v1 shape", () => {
    const spec = validateThemeSpec({
      name: "legacy",
      mode: "dark",
      background: null,
      colors: {
        primary: "white",
        secondary: "gray",
        accent: "white",
        success: "green",
        error: "red",
        warning: "yellow",
        code: "white",
        heading: "white",
        diffAdd: "green",
        diffDel: "red",
        diffContext: "gray",
      },
    });
    expect(spec?.mode).toBe("dark");
    expect(spec?.colors.text).toBe("white");
  });
});

describe("buildTheme", () => {
  it("styles with ansi sequences and brand tokens stay monochrome", () => {
    const theme = buildTheme(DEEPSEEK_DARK);
    expect(theme.user("hi")).toContain("\u001b[");
    expect(theme.diffAdded("x")).toContain("\u001b[");
    expect(DEEPSEEK_DARK.colors.primary).toBe("#FFFFFF");
    expect(DEEPSEEK_DARK.colors.roleUser).toBe("#FFFFFF");
  });

  it("inverts per mode: dark = black-on-white, light = white-on-black", () => {
    expect(buildTheme(DEEPSEEK_DARK).inverted("x")).toContain("\u001b[30m\u001b[47m");
    expect(buildTheme(DEEPSEEK_LIGHT).inverted("x")).toContain("\u001b[37m\u001b[40m");
  });

  it("exposes the four text levels and agent hues", () => {
    const theme = buildTheme(DEEPSEEK_DARK);
    expect(typeof theme.text("a")).toBe("string");
    expect(typeof theme.strong("a")).toBe("string");
    expect(typeof theme.dim("a")).toBe("string");
    expect(typeof theme.muted("a")).toBe("string");
    for (let i = 0; i < 8; i++) expect(typeof theme.agentHue(i, "a")).toBe("string");
  });

  it("ships daltonized themes with blue diffs", () => {
    expect(DEEPSEEK_DARK_DALTONIZED.colors.diffAdded).toBe("#66B2FF");
    expect(DEEPSEEK_DARK_DALTONIZED.colors.success).toBe("#66B2FF");
  });
});
