import { describe, expect, it } from "vitest";
import { buildProfileSummary, mergeShopperProfilePreferences, toSessionPreferences } from "./profile.js";

describe("shopper profile", () => {
  it("merges anonymous shopping signals into preferences", () => {
    const profile = mergeShopperProfilePreferences({
      favoriteBrands: ["Adidas"],
      recentClickedHandles: ["old-handle"],
    }, {
      filters: {
        brand: "Nike",
        size: "44",
        color: "red",
        category: "football",
        maxPrice: 250,
      },
      clickedHandles: ["nike-phantom"],
      eventName: "add_to_cart",
    });

    expect(profile.preferredSize).toBe("44");
    expect(profile.preferredBudget).toBe(250);
    expect(profile.favoriteBrands).toEqual(["Nike", "Adidas"]);
    expect(profile.preferredColors).toEqual(["red"]);
    expect(profile.preferredCategories).toEqual(["football"]);
    expect(profile.recentClickedHandles).toEqual(["nike-phantom", "old-handle"]);
    expect(profile.recentCartIntent).toBe("cart_has_items");
  });

  it("builds profile badges and session preferences", () => {
    const preferences = {
      preferredSize: "44",
      preferredBudget: 200,
      favoriteBrands: ["Nike"],
      preferredCategories: ["lifestyle"],
    };

    expect(buildProfileSummary(preferences).badges).toEqual(["Size 44", "Nike", "Under $200"]);
    expect(toSessionPreferences(preferences)).toMatchObject({
      favoriteBrand: "Nike",
      preferredSize: "44",
      preferredCategory: "lifestyle",
    });
  });
});
