import { describe, expect, it } from "vitest";
import { buildGuidedSearchPrompt } from "./guided-flow.js";

describe("guided shopping flow", () => {
  it("turns guided answers into a direct search prompt", () => {
    expect(buildGuidedSearchPrompt({
      category: "lifestyle",
      size: "44",
      gender: "men",
      budget: "250",
      style: "black",
      brand: "Nike",
    })).toBe("Show me men Nike black lifestyle shoes size 44 under $250");
  });

  it("skips any answers marked as any", () => {
    expect(buildGuidedSearchPrompt({
      category: "running",
      size: "42",
      gender: "any",
      budget: "any",
      style: "any",
      brand: "Adidas",
    })).toBe("Show me Adidas running shoes size 42");
  });
});
