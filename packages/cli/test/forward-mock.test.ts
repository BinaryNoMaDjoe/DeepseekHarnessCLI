import { describe, expect, it } from "vitest";
import { forwardMockArgs } from "../src/main.js";

describe("forwardMockArgs", () => {
  it("passes non-mock args through untouched", () => {
    expect(forwardMockArgs(["--print", "hi"])).toEqual({ args: ["--print", "hi"] });
  });

  it("strips --mock, sets the env, and fills mock defaults", () => {
    expect(forwardMockArgs(["--mock", "--print", "hi"])).toEqual({
      args: ["--print", "hi", "--provider", "mock", "--model", "mock-v1"],
      env: { DSH_MOCK_LLM: "1" },
    });
  });

  it("keeps an explicit provider and model when given", () => {
    expect(forwardMockArgs(["--mock", "--provider", "mock", "-m", "mock-v1"])).toEqual({
      args: ["--provider", "mock", "-m", "mock-v1"],
      env: { DSH_MOCK_LLM: "1" },
    });
  });

  it("honors the --model=value form and a valueless --model", () => {
    expect(forwardMockArgs(["--mock", "--model=mock-v2"])).toEqual({
      args: ["--model=mock-v2", "--provider", "mock"],
      env: { DSH_MOCK_LLM: "1" },
    });
    // A dangling --model carries no value: the mock default must be filled.
    expect(forwardMockArgs(["--mock", "--model"])).toEqual({
      args: ["--model", "--provider", "mock", "--model", "mock-v1"],
      env: { DSH_MOCK_LLM: "1" },
    });
  });
});
