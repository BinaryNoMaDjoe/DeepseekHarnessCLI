import { describe, expect, it } from "vitest";
import { buildManifest, resolveDshHome } from "../src/install.js";

describe("buildManifest", () => {
  it("lists dsh-base then the tui bundle in order", () => {
    const manifest = buildManifest("@deepseek-harness/tui-bundle@latest");
    const bundles = (manifest.dsh as { profile: { bundles: string[] } }).profile.bundles;
    expect(bundles).toEqual(["@deepseek-ai/dsh-base", "@deepseek-harness/tui-bundle"]);
    expect(manifest.dependencies).toEqual({
      "@deepseek-harness/tui-bundle": "@deepseek-harness/tui-bundle@latest",
    });
  });

  it("uses a link: dependency for local checkouts", () => {
    const manifest = buildManifest("x", "C:\\workspace\\packages\\bundle");
    expect(manifest.dependencies).toEqual({
      "@deepseek-harness/tui-bundle": "link:C:\\workspace\\packages\\bundle",
    });
  });
});

describe("resolveDshHome", () => {
  it("prefers the explicit override", () => {
    expect(resolveDshHome("C:\\tmp\\dsh")).toBe("C:\\tmp\\dsh");
  });
});
