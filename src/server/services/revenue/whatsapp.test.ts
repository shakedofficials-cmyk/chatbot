import { describe, expect, it } from "vitest";
import type { Product } from "../../../shared/types.js";
import { buildWhatsAppActions, buildWhatsAppUrl, isHumanHandoffRequest } from "./whatsapp.js";

const product: Product = {
  id: "p1",
  handle: "nike-air-force-1",
  title: "Nike Air Force 1",
  description: "",
  vendor: "Nike",
  productType: "Lifestyle",
  tags: [],
  images: [],
  options: [{ name: "Size", values: ["44"] }],
  variants: [{
    id: "v1",
    title: "44",
    availableForSale: false,
    quantityAvailable: 0,
    price: { amount: "180", currencyCode: "USD" },
    compareAtPrice: null,
    selectedOptions: [{ name: "Size", value: "44" }],
    image: null,
  }],
  priceRange: {
    minVariantPrice: { amount: "180", currencyCode: "USD" },
    maxVariantPrice: { amount: "180", currencyCode: "USD" },
  },
  metafields: {},
};

describe("WhatsApp revenue actions", () => {
  it("normalizes numbers and encodes messages", () => {
    const url = buildWhatsAppUrl("+961 70 123 456", "Hi ORJN\nSize: 44");

    expect(url).toContain("https://wa.me/96170123456");
    expect(url).toContain("Hi%20ORJN");
    expect(url).toContain("Size%3A%2044");
  });

  it("creates an action when requested size is unavailable", () => {
    const actions = buildWhatsAppActions({
      whatsappNumber: "96170123456",
      userMessage: "do you have size 44",
      products: [product],
      filters: { size: "44" },
      intent: "size_lookup",
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Ask ORJN on WhatsApp");
    expect(actions[0].url).toContain("nike-air-force-1");
  });

  it("recognizes agent handoff requests", () => {
    const actions = buildWhatsAppActions({
      whatsappNumber: "96170123456",
      userMessage: "connect me to an agent",
      products: [],
      filters: {},
      intent: "policy_support",
    });

    expect(isHumanHandoffRequest("connect me to an agent")).toBe(true);
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Chat on WhatsApp");
  });
});
