import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isNestedHarnessSession, resolveDshHome } from "../src/install.js";

function clearHarnessEnv(): void {
  delete process.env.DSH_SESSION_ID;
  delete process.env.DSH_SHELL;
  delete process.env.DSH_WEB_URL;
  delete process.env.DSH_HOME;
}

beforeEach(clearHarnessEnv);
afterEach(clearHarnessEnv);

describe("isNestedHarnessSession", () => {
  it("is false without harness markers", () => {
    expect(isNestedHarnessSession()).toBe(false);
  });

  it("detects a harness session via DSH_SESSION_ID", () => {
    process.env.DSH_SESSION_ID = "session-1";
    expect(isNestedHarnessSession()).toBe(true);
  });
});

describe("resolveDshHome", () => {
  it("ignores the inherited DSH_HOME inside a nested session", () => {
    process.env.DSH_SESSION_ID = "session-1";
    process.env.DSH_HOME = "C:\\host-home";
    expect(resolveDshHome()).not.toContain("host-home");
  });

  it("honors DSH_HOME outside a nested session", () => {
    process.env.DSH_HOME = "C:\\my-home";
    expect(resolveDshHome()).toBe("C:\\my-home");
  });
});
