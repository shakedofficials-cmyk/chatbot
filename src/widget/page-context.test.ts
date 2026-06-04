import { describe, expect, it } from "vitest";
import { detectPageContextFromUrl, nudgeCopyForPageContext } from "./page-context.js";

describe("page context", () => {
  it("detects product pages and product nudges", () => {
    const context = detectPageContextFromUrl("https://orjnstore.com/products/nike-air-max-90?variant=1");

    expect(context).toMatchObject({ type: "product", handle: "nike-air-max-90" });
    expect(nudgeCopyForPageContext(context).title).toBe("Need your size?");
  });

  it("detects search pages and search nudges", () => {
    const context = detectPageContextFromUrl("https://orjnstore.com/search?q=air+force");

    expect(context).toMatchObject({ type: "search", query: "air force" });
    expect(nudgeCopyForPageContext(context).title).toBe("Filter faster");
  });
});
