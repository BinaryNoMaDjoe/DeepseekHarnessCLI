import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Profile provisioning for the DSHT surface. The dsh launcher refuses to
 * boot a profile whose directory has no manifest, and the in-box templates
 * cover only web/headless — so dsht install materializes the tui profile
 * under $DSH_HOME/profiles/tui and pnpm-installs the DSHT bundle into it
 * (bundles resolve installation-first, then from the profile directory).
 */

export const PROFILE_NAME = "tui";
export const BASE_BUNDLE = "@deepseek-ai/dsh-base";
export const TUI_BUNDLE = "@deepseek-harness/tui-bundle";

export interface InstallOptions {
  home?: string;
  linkPath?: string;
  bundleSpec?: string;
  manifestOnly?: boolean;
  pnpm?: string;
}

export interface InstallResult {
  profileDir: string;
  manifestPath: string;
  created: boolean;
}

export function resolveDshHome(home?: string): string {
  if (home !== undefined && home !== "") return home;
  const env = process.env.DSH_HOME;
  if (env !== undefined && env !== "") return env;
  return join(homedir(), ".dsh");
}

export function profileDirOf(home?: string): string {
  return join(resolveDshHome(home), "profiles", PROFILE_NAME);
}

/** The profile manifest: ordered bundle layers plus the out-of-tree dep. */
export function buildManifest(bundleSpec: string, linkPath?: string): Record<string, unknown> {
  const dependency =
    linkPath !== undefined && linkPath !== "" ? "link:" + resolve(linkPath) : bundleSpec;
  return {
    name: "dsh-profile-tui",
    private: true,
    type: "module",
    dsh: {
      profile: {
        bundles: [BASE_BUNDLE, TUI_BUNDLE],
      },
    },
    dependencies: {
      [TUI_BUNDLE]: dependency,
    },
  };
}

const PATCH_TEMPLATE = [
  "# Your patch layer for the tui profile, applied after every bundle layer:",
  "# a top-level YAML array of loader patch entries (id-targeted config",
  "# overrides, disables, and insert lists; !!js expressions allowed).",
  "[]",
  "",
].join("\n");

const PNPM_WORKSPACE = [
  "packages:",
  "  - .",
  "",
  "nodeLinker: hoisted",
  "autoInstallPeers: false",
  "",
].join("\n");

export function writeProfileFiles(profileDir: string, manifest: Record<string, unknown>): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, "package.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const patchPath = join(profileDir, "cordis.patch.yml");
  if (!existsSync(patchPath)) writeFileSync(patchPath, PATCH_TEMPLATE, "utf8");
  writeFileSync(join(profileDir, "pnpm-workspace.yaml"), PNPM_WORKSPACE, "utf8");
}

/** Install (or repair) the tui profile. */
export function installProfile(options: InstallOptions = {}): InstallResult {
  const profileDir = profileDirOf(options.home);
  const bundleSpec = options.bundleSpec ?? TUI_BUNDLE + "@latest";
  const manifest = buildManifest(bundleSpec, options.linkPath);
  writeProfileFiles(profileDir, manifest);

  if (options.manifestOnly !== true) {
    const pnpm = options.pnpm ?? "pnpm";
    const run = spawnSync(pnpm, ["install"], {
      cwd: profileDir,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    if (run.error !== undefined) {
      throw new Error("pnpm failed: " + run.error.message);
    }
    if (run.status !== 0) {
      throw new Error("pnpm install exited with code " + String(run.status));
    }
  }
  return {
    profileDir,
    manifestPath: join(profileDir, "package.json"),
    created: true,
  };
}

/** Remove the tui profile directory. */
export function uninstallProfile(home?: string): void {
  const profileDir = profileDirOf(home);
  if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
}

/** True when the tui profile manifest exists. */
export function isInstalled(home?: string): boolean {
  return existsSync(join(profileDirOf(home), "package.json"));
}
