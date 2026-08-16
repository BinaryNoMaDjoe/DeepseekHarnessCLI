import { describe, expect, it } from "vitest";
import { firstEmptyField } from "../src/components/Dialog.js";

describe("firstEmptyField", () => {
  it("returns null when every field is filled", () => {
    expect(
      firstEmptyField(
        [
          { key: "provider", label: "provider" },
          { key: "model", label: "model" },
        ],
        { provider: "deepseek-official", model: "deepseek-v4-flash" },
      ),
    ).toBeNull();
  });

  it("finds the first empty field in order", () => {
    const empty = firstEmptyField(
      [
        { key: "provider", label: "provider" },
        { key: "model", label: "model" },
      ],
      { provider: "  ", model: "m" },
    );
    expect(empty?.key).toBe("provider");
  });
});
