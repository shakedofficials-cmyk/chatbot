import type { Product, ProductComparison, Cart, CartLine } from "../../../shared/types.js";
import { MOCK_PRODUCTS } from "../shopify/mock-data.js";
import { answerPolicyQuestion } from "../knowledge/index.js";
import { logEvent } from "../analytics/index.js";
import type { ToolResult } from "./tool-executor.js";
import { nanoid } from "nanoid";

// In-memory mock carts
const mockCarts = new Map<string, Cart>();

export async function executeMockTool(
  toolName: string,
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  switch (toolName) {
    case "search_products": {
      const query = (input.query ?? "").toLowerCase();
      const brand = input.brand?.toLowerCase();
      const maxPrice = input.max_price;
      const color = input.color?.toLowerCase();

      let results = MOCK_PRODUCTS.filter((p) => {
        const haystack = `${p.title} ${p.vendor} ${p.productType} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
        const terms = query.split(/\s+/).filter((t: string) => t.length > 2);
        return terms.length === 0 || terms.some((t: string) => haystack.includes(t));
      });

      if (brand) results = results.filter((p) => p.vendor.toLowerCase().includes(brand));
      if (color) results = results.filter((p) => {
        const h = `${p.title} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
        return h.includes(color);
      });
      if (maxPrice) results = results.filter((p) => parseFloat(p.priceRange.minVariantPrice.amount) <= maxPrice);
      if (input.in_stock) results = results.filter((p) => p.variants.some((v) => v.availableForSale));

      await logEvent(sessionId, "product_search", { query, resultCount: results.length });

      if (results.length === 0) {
        await logEvent(sessionId, "no_result", { query });
        return { content: "No products found matching that search.", products: [] };
      }

      return {
        content: JSON.stringify(results.map((p) => ({
          handle: p.handle,
          title: p.title,
          vendor: p.vendor,
          productType: p.productType,
          price: `${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}`,
          compareAtPrice: p.variants[0]?.compareAtPrice ? `${p.variants[0].compareAtPrice.amount} ${p.variants[0].compareAtPrice.currencyCode}` : null,
          availableSizes: p.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean),
          fit: p.metafields.fitProfile ?? null,
          material: p.metafields.materialSummary ?? null,
        }))),
        products: results,
      };
    }

    case "get_product": {
      const id = input.handle_or_id;
      const product = MOCK_PRODUCTS.find((p) => p.handle === id || p.id === id);
      if (!product) return { content: `Product not found: ${id}` };

      return {
        content: JSON.stringify({
          handle: product.handle,
          title: product.title,
          vendor: product.vendor,
          price: `${product.priceRange.minVariantPrice.amount} ${product.priceRange.minVariantPrice.currencyCode}`,
          availableSizes: product.variants.filter((v) => v.availableForSale).map((v) => ({ size: v.selectedOptions.find((o) => o.name === "Size")?.value, variantId: v.id, quantity: v.quantityAvailable })),
          outOfStock: product.variants.filter((v) => !v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value),
          fit: product.metafields.fitProfile,
          material: product.metafields.materialSummary,
        }),
        products: [product],
      };
    }

    case "get_variant_by_options": {
      const product = MOCK_PRODUCTS.find((p) => p.handle === input.handle_or_id || p.id === input.handle_or_id);
      if (!product) return { content: `Product not found: ${input.handle_or_id}` };

      const opts = input.selected_options ?? {};
      const variant = product.variants.find((v) =>
        Object.entries(opts).every(([name, value]) =>
          v.selectedOptions.some((o) => o.name.toLowerCase() === (name as string).toLowerCase() && o.value.toLowerCase() === (value as string).toLowerCase())
        )
      );

      if (!variant) {
        const available = product.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.map((o) => `${o.name}: ${o.value}`).join(", "));
        return { content: `Variant not found. Available: ${available.join(" | ")}`, products: [product] };
      }

      await logEvent(sessionId, "size_availability_requested", { product: product.handle, variant: variant.id });

      return {
        content: JSON.stringify({
          variantId: variant.id,
          title: variant.title,
          price: `${variant.price.amount} ${variant.price.currencyCode}`,
          available: variant.availableForSale,
          quantityAvailable: variant.quantityAvailable,
          selectedOptions: variant.selectedOptions,
        }),
        products: [product],
      };
    }

    case "compare_products": {
      const ids: string[] = input.product_ids ?? [];
      const products = ids.map((id) => MOCK_PRODUCTS.find((p) => p.handle === id || p.id === id)).filter(Boolean) as Product[];
      if (products.length < 2) return { content: "Need at least 2 valid products to compare." };

      await logEvent(sessionId, "comparison_requested", { products: products.map((p) => p.handle) });

      const comparison: ProductComparison = {
        products,
        comparison: {
          prices: products.map((p) => ({
            handle: p.handle,
            price: `${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}`,
            compareAtPrice: p.variants[0]?.compareAtPrice ? `${p.variants[0].compareAtPrice.amount} ${p.variants[0].compareAtPrice.currencyCode}` : null,
          })),
          availableSizes: products.map((p) => ({
            handle: p.handle,
            sizes: p.variants.filter((v) => v.availableForSale).flatMap((v) => v.selectedOptions.filter((o) => o.name === "Size").map((o) => o.value)),
          })),
          brands: products.map((p) => ({ handle: p.handle, brand: p.vendor })),
          productTypes: products.map((p) => ({ handle: p.handle, type: p.productType })),
          materials: products.map((p) => ({ handle: p.handle, material: p.metafields.materialSummary ?? null })),
          recommendations: "",
        },
      };

      return { content: JSON.stringify(comparison.comparison), comparison, products };
    }

    case "cart_create": {
      const id = `mock-cart-${nanoid(8)}`;
      const cart: Cart = {
        id,
        checkoutUrl: `https://demo.myshopify.com/checkout/${id}`,
        totalQuantity: 0,
        lines: [],
        cost: { totalAmount: { amount: "0.00", currencyCode: "USD" }, subtotalAmount: { amount: "0.00", currencyCode: "USD" } },
      };
      mockCarts.set(id, cart);
      return { content: JSON.stringify({ cartId: id }), cart };
    }

    case "cart_add_lines": {
      let cart = mockCarts.get(input.cart_id);
      if (!cart) {
        // Auto-create
        cart = { id: input.cart_id, checkoutUrl: `https://demo.myshopify.com/checkout/${input.cart_id}`, totalQuantity: 0, lines: [], cost: { totalAmount: { amount: "0.00", currencyCode: "USD" }, subtotalAmount: { amount: "0.00", currencyCode: "USD" } } };
        mockCarts.set(input.cart_id, cart);
      }

      const variant = MOCK_PRODUCTS.flatMap((p) => p.variants.map((v) => ({ ...v, productTitle: p.title, productHandle: p.handle }))).find((v) => v.id === input.variant_id);
      const qty = input.quantity ?? 1;

      if (variant) {
        cart.lines.push({
          id: `line-${nanoid(6)}`,
          quantity: qty,
          merchandise: {
            id: variant.id,
            title: variant.title,
            product: { title: variant.productTitle, handle: variant.productHandle },
            image: null,
            price: variant.price,
            selectedOptions: variant.selectedOptions,
          },
        });
        cart.totalQuantity += qty;
        const total = cart.lines.reduce((sum, l) => sum + l.quantity * parseFloat(l.merchandise.price.amount), 0);
        cart.cost.totalAmount.amount = total.toFixed(2);
        cart.cost.subtotalAmount.amount = total.toFixed(2);
      }

      await logEvent(sessionId, "add_to_cart", { variant: input.variant_id });

      return {
        content: `Added to cart. ${cart.totalQuantity} item(s), total: ${cart.cost.totalAmount.amount} ${cart.cost.totalAmount.currencyCode}`,
        cart,
      };
    }

    case "cart_update_lines": {
      const cart = mockCarts.get(input.cart_id);
      if (!cart) return { content: "Cart not found." };
      const line = cart.lines.find((l) => l.id === input.line_id);
      if (line) {
        cart.totalQuantity += input.quantity - line.quantity;
        line.quantity = input.quantity;
        if (input.quantity === 0) cart.lines = cart.lines.filter((l) => l.id !== input.line_id);
        const total = cart.lines.reduce((sum, l) => sum + l.quantity * parseFloat(l.merchandise.price.amount), 0);
        cart.cost.totalAmount.amount = total.toFixed(2);
      }
      return { content: `Cart updated. ${cart.totalQuantity} item(s).`, cart };
    }

    case "get_cart": {
      const cart = mockCarts.get(input.cart_id);
      if (!cart) return { content: "Cart not found." };
      return { content: JSON.stringify(cart), cart };
    }

    case "get_checkout_url": {
      const cart = mockCarts.get(input.cart_id);
      if (!cart) return { content: "Cart not found." };
      await logEvent(sessionId, "checkout_started", {});
      return { content: cart.checkoutUrl, checkoutUrl: cart.checkoutUrl, cart };
    }

    case "answer_policy_question": {
      const result = answerPolicyQuestion(input.question);
      await logEvent(sessionId, "policy_question", { question: input.question });
      return { content: result.answer };
    }

    default:
      return { content: `Unknown tool: ${toolName}` };
  }
}
