import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

export const AI_TOOLS: Tool[] = [
  {
    name: "search_products",
    description:
      "Search the ORJN product catalog. Use this for any product discovery, recommendation, or browsing request. Supports filters for brand, price range, category, color, product type, and in-stock preference.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query, e.g. 'black sneakers' or 'adidas running shoes'",
        },
        brand: { type: "string", description: "Filter by brand/vendor, e.g. 'Nike', 'Adidas'" },
        min_price: { type: "number", description: "Minimum price filter" },
        max_price: { type: "number", description: "Maximum price filter" },
        category: { type: "string", description: "Category keyword, e.g. 'sneakers', 'sportswear'" },
        color: { type: "string", description: "Color filter, e.g. 'black', 'white'" },
        product_type: { type: "string", description: "Shopify product type filter" },
        in_stock: { type: "boolean", description: "Only show in-stock products" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_product",
    description:
      "Get full details for a specific product by its handle (URL slug) or Shopify ID. Use when the user asks about a specific product or you need detailed info.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle_or_id: {
          type: "string",
          description: "Product handle (e.g. 'adidas-samba-og') or Shopify GID",
        },
      },
      required: ["handle_or_id"],
    },
  },
  {
    name: "get_variant_by_options",
    description:
      "Resolve a specific product variant by selected options like size and color. Use when the user asks for a specific size, color, or combination.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle_or_id: { type: "string", description: "Product handle or Shopify GID" },
        selected_options: {
          type: "object",
          description: "Key-value pairs of option name to value, e.g. { \"Size\": \"43\", \"Color\": \"Black\" }",
          additionalProperties: { type: "string" },
        },
      },
      required: ["handle_or_id", "selected_options"],
    },
  },
  {
    name: "get_variant_availability",
    description:
      "Check availability and stock for a specific variant. Use when the user asks if a size/color is in stock.",
    input_schema: {
      type: "object" as const,
      properties: {
        variant_id: { type: "string", description: "The variant's Shopify GID" },
        handle_or_id: { type: "string", description: "Product handle or Shopify GID" },
      },
      required: ["variant_id", "handle_or_id"],
    },
  },
  {
    name: "compare_products",
    description:
      "Compare two or more products side by side. Returns structured comparison data including price, available sizes, brand, type, materials, and a recommendation.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of product handles or Shopify GIDs to compare (2–4 products)",
        },
      },
      required: ["product_ids"],
    },
  },
  {
    name: "cart_create",
    description: "Create a new shopping cart. Use this before adding items if no cart exists yet.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "cart_add_lines",
    description:
      "Add a product variant to the cart. You must have the exact variant ID (from get_variant_by_options) and an existing cart ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        cart_id: { type: "string", description: "The cart's Shopify GID" },
        variant_id: { type: "string", description: "The variant's Shopify GID to add" },
        quantity: { type: "number", description: "Quantity to add (default 1)" },
      },
      required: ["cart_id", "variant_id"],
    },
  },
  {
    name: "cart_update_lines",
    description:
      "Update quantity of an item already in the cart. Use for quantity changes or removal (set quantity to 0).",
    input_schema: {
      type: "object" as const,
      properties: {
        cart_id: { type: "string", description: "The cart's Shopify GID" },
        line_id: { type: "string", description: "The cart line ID to update" },
        quantity: { type: "number", description: "New quantity (0 to remove)" },
      },
      required: ["cart_id", "line_id", "quantity"],
    },
  },
  {
    name: "get_cart",
    description: "Retrieve the current cart state with all items, quantities, and totals.",
    input_schema: {
      type: "object" as const,
      properties: {
        cart_id: { type: "string", description: "The cart's Shopify GID" },
      },
      required: ["cart_id"],
    },
  },
  {
    name: "get_checkout_url",
    description:
      "Get the checkout URL for the current cart. Use when the user wants to proceed to checkout.",
    input_schema: {
      type: "object" as const,
      properties: {
        cart_id: { type: "string", description: "The cart's Shopify GID" },
      },
      required: ["cart_id"],
    },
  },
  {
    name: "answer_policy_question",
    description:
      "Answer a store policy question (shipping, returns, authenticity, sizing, care, support, payment). Use for any non-product question about ORJN policies.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The policy question to answer",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "log_event",
    description:
      "Log an analytics event. Call this to track user interactions like searches, clicks, add-to-cart, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_name: {
          type: "string",
          enum: [
            "product_search",
            "product_clicked",
            "comparison_requested",
            "add_to_cart",
            "checkout_started",
            "fallback_triggered",
            "no_result",
            "policy_question",
            "size_availability_requested",
          ],
          description: "The event name to log",
        },
        payload: {
          type: "object",
          description: "Additional event data",
          additionalProperties: true,
        },
      },
      required: ["event_name"],
    },
  },
];
