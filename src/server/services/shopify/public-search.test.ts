import { describe, expect, it } from "vitest";
import { extractHandles } from "./public-search.js";

describe("public storefront search parsing", () => {
  it("prefers visible product-grid links over script noise", () => {
    const html = `
      <script>{"url":"/products/script-noise"}</script>
      <ul id="ResultsList">
        <li data-product-id="1">
          <a href="/products/nike-vomero-plus?variant=123">Nike Vomero Plus</a>
        </li>
        <li data-product-id="2">
          <a href="/products/nike-journey-run?variant=456">Nike Journey Run</a>
        </li>
      </ul>
    `;

    expect(extractHandles(html, 2)).toEqual(["nike-vomero-plus", "nike-journey-run"]);
  });
});
