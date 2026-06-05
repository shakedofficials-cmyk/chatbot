import { describe, expect, it } from "vitest";
import type { QueryUnderstanding } from "../../../shared/types.js";
import {
  applyProfileToUnderstanding,
  buildQuickReplies,
  buildShoppingMission,
  missionQuestion,
} from "./shopping-mission.js";

function understanding(input: Partial<QueryUnderstanding> = {}): QueryUnderstanding {
  return {
    normalizedQuery: "show me shoes",
    intent: "product_search",
    filters: {},
    entities: { styleTerms: [], rawTerms: [] },
    ...input,
  };
}

describe("shopping mission", () => {
  it("uses profile memory to fill missing shopper slots", () => {
    const result = applyProfileToUnderstanding(understanding({ filters: { category: "shoe" } }), {
      preferredSize: "44",
      preferredBudget: 250,
      preferredGender: "men",
      favoriteBrands: ["Nike"],
      preferredCategories: ["lifestyle"],
      preferredColors: ["black"],
    });

    expect(result.filters).toMatchObject({
      size: "44",
      maxPrice: 250,
      gender: "men",
      brand: "Nike",
      category: "lifestyle",
      color: "black",
    });
  });

  it("asks one sharp question for vague missions", () => {
    const mission = buildShoppingMission(understanding({ filters: { size: "44" } }));

    expect(mission.missingSlots[0]).toBe("style");
    expect(missionQuestion(mission)).toBe("What kind of pair are we finding?");
    expect(buildQuickReplies({
      mission,
      filters: { size: "44" },
      products: [],
      whatsappEnabled: true,
    }).map((reply) => reply.label)).toEqual(["Lifestyle", "Running", "Football", "Basketball"]);
  });

  it("creates active closer replies after product results", () => {
    const mission = buildShoppingMission(understanding({ filters: { size: "44", category: "football" } }));
    const replies = buildQuickReplies({
      mission,
      filters: { size: "44", category: "football" },
      products: [
        { handle: "a" } as any,
        { handle: "b" } as any,
      ],
      whatsappEnabled: true,
    });

    expect(replies.map((reply) => reply.label)).toEqual([
      "Secure size 44",
      "Compare top 2",
      "Show similar",
      "Ask WhatsApp",
    ]);
  });
});
