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

  it("does not force profile size or style into explicit shopper searches", () => {
    const profile = {
      preferredSize: "43",
      preferredBudget: 250,
      preferredGender: "men",
      favoriteBrands: ["Nike"],
      preferredCategories: ["basketball"],
      preferredColors: ["green"],
    };

    const womenAsics = applyProfileToUnderstanding(
      understanding({
        normalizedQuery: "show me women asics",
        filters: { brand: "Asics", gender: "women", tags: "women" },
      }),
      profile
    );
    const kids = applyProfileToUnderstanding(
      understanding({
        normalizedQuery: "show me some kids shoes",
        filters: { category: "shoe", gender: "kids", tags: "kids" },
      }),
      profile
    );

    expect(womenAsics.filters).toMatchObject({ brand: "Asics", gender: "women" });
    expect(womenAsics.filters.size).toBeUndefined();
    expect(womenAsics.filters.color).toBeUndefined();
    expect(kids.filters).toMatchObject({ category: "shoe", gender: "kids" });
    expect(kids.filters.size).toBeUndefined();
    expect(kids.filters.brand).toBeUndefined();
    expect(kids.filters.color).toBeUndefined();
  });

  it("uses profile size when the shopper explicitly asks for their saved size", () => {
    const result = applyProfileToUnderstanding(
      understanding({
        normalizedQuery: "show me asics in my size",
        filters: { brand: "Asics" },
      }),
      { preferredSize: "43", favoriteBrands: ["Nike"] }
    );

    expect(result.filters.brand).toBe("Asics");
    expect(result.filters.size).toBe("43");
    expect(result.filters.color).toBeUndefined();
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
    expect(replies[0]).toMatchObject({
      prompt: "Add size 44 to cart for a",
      action: {
        type: "add_to_cart",
        productHandle: "a",
        size: "44",
      },
    });
  });
});
