export const AI_TOOLS = [
  {
    type: "function" as const,
    name: "search_products",
    description:
      "Search the synced ORJN catalog using grounded hybrid retrieval. Use for product discovery, recommendations, style queries, and browsing. Supports structured filters such as brand, model, size, color, price, category, and in-stock preference.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language catalog query such as 'clean everyday sneaker' or 'adidas gazelle black'",
        },
        brand: { type: "string", description: "Brand/vendor filter, e.g. 'Nike' or 'Adidas'" },
        model: { type: "string", description: "Model or silhouette filter, e.g. 'Dunk', 'Samba', 'Gazelle'" },
        size: { type: "string", description: "Requested size — EU ('44'), US ('10 US'), or UK ('9 UK'). Normalised automatically." },
        min_price: { type: "number", description: "Minimum price filter" },
        max_price: { type: "number", description: "Maximum price filter" },
        category: { type: "string", description: "Category or type such as 'sneakers' or 'runner'" },
        color: { type: "string", description: "Color filter, e.g. 'black', 'white'" },
        product_type: { type: "string", description: "Normalized product type filter" },
        in_stock: { type: "boolean", description: "Only return in-stock products" },
        tags: { type: "string", description: "Tag filter for collection/audience e.g. 'men', 'women', 'lifestyle', 'running', 'basketball'" },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "get_product",
    description:
      "Get grounded catalog details for a specific product by handle or Shopify product ID.",
    parameters: {
      type: "object",
      properties: {
        handle_or_id: {
          type: "string",
          description: "Product handle like 'nike-dunk-low' or Shopify product GID",
        },
      },
      required: ["handle_or_id"],
    },
  },
  {
    type: "function" as const,
    name: "get_size_availability",
    description:
      "Check size availability for a product. Two use cases: (1) Specific size check — 'do you have dunks in size 44?' Pass size + handle_or_id or query. Returns has_requested_size, available_sizes, closest_sizes. (2) Full size listing — 'what sizes do you have?' Omit size and pass handle_or_id. Returns all available and unavailable sizes for that product. Always use handle_or_id when the product was already shown in context — do NOT re-search.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language product query — use only when the product handle is NOT known from context",
        },
        handle_or_id: {
          type: "string",
          description: "Product handle or Shopify GID — prefer this over query when the product was already shown",
        },
        size: {
          type: "string",
          description: "Specific size to check — EU ('44', '44.5'), US ('10 US'), or UK ('9 UK'). Omit when asking for all sizes.",
        },
      },
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "find_similar_products",
    description:
      "Find a small set of strong alternatives similar to a known product or a style prompt. Use when the user wants similar options or a more premium/cleaner alternative.",
    parameters: {
      type: "object",
      properties: {
        handle_or_id: {
          type: "string",
          description: "Optional product handle or Shopify product GID to anchor similarity",
        },
        query: {
          type: "string",
          description: "Optional style query such as 'something like Samba but more premium'",
        },
      },
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "compare_products",
    description:
      "Compare two or more catalog products side by side. Returns structured comparison data including price, available sizes, type, and materials.",
    parameters: {
      type: "object",
      properties: {
        product_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of product handles or Shopify product IDs to compare",
        },
      },
      required: ["product_ids"],
    },
  },
  {
    type: "function" as const,
    name: "get_variant_by_options",
    description:
      "Resolve an exact variant from selected options like size and color when the specific product is already known. Size is normalised automatically — pass '44', '10 US', or '9 UK' and the system resolves to the correct EU variant. Returns has_requested_size, available_sizes, and closest_sizes so you can respond accurately even when the exact size is out of stock.",
    parameters: {
      type: "object",
      properties: {
        handle_or_id: { type: "string", description: "Product handle or Shopify product GID" },
        selected_options: {
          type: "object",
          description: "Key-value pairs like { \"Size\": \"44\", \"Color\": \"Black\" }. Size may be EU, US, or UK — it is resolved automatically.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["handle_or_id", "selected_options"],
    },
  },
  {
    type: "function" as const,
    name: "get_variant_availability",
    description:
      "Check availability for a specific variant ID on a known product. Returns available_sizes and closest_sizes alongside the availability status.",
    parameters: {
      type: "object",
      properties: {
        variant_id: { type: "string", description: "Variant Shopify GID" },
        handle_or_id: { type: "string", description: "Product handle or Shopify GID" },
      },
      required: ["variant_id", "handle_or_id"],
    },
  },
  {
    type: "function" as const,
    name: "get_policy",
    description:
      "Answer ORJN non-product policy questions such as shipping, returns, COD, payments, or authenticity.",
    parameters: {
      type: "object",
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
    type: "function" as const,
    name: "cart_create",
    description: "Create a new shopping cart.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "cart_add_lines",
    description:
      "Add an exact variant to cart. Requires an existing cart ID and exact variant ID.",
    parameters: {
      type: "object",
      properties: {
        cart_id: { type: "string", description: "The cart Shopify GID" },
        variant_id: { type: "string", description: "The variant Shopify GID" },
        quantity: { type: "number", description: "Quantity to add" },
      },
      required: ["cart_id", "variant_id"],
    },
  },
  {
    type: "function" as const,
    name: "cart_update_lines",
    description:
      "Update the quantity of an existing cart line.",
    parameters: {
      type: "object",
      properties: {
        cart_id: { type: "string", description: "The cart Shopify GID" },
        line_id: { type: "string", description: "The cart line ID" },
        quantity: { type: "number", description: "New quantity, including 0 for removal" },
      },
      required: ["cart_id", "line_id", "quantity"],
    },
  },
  {
    type: "function" as const,
    name: "get_cart",
    description: "Get the current cart contents and totals.",
    parameters: {
      type: "object",
      properties: {
        cart_id: { type: "string", description: "The cart Shopify GID" },
      },
      required: ["cart_id"],
    },
  },
  {
    type: "function" as const,
    name: "get_checkout_url",
    description: "Get the checkout URL for the current cart.",
    parameters: {
      type: "object",
      properties: {
        cart_id: { type: "string", description: "The cart Shopify GID" },
      },
      required: ["cart_id"],
    },
  },
  {
    type: "function" as const,
    name: "log_event",
    description:
      "Log analytics events such as product_search, comparison_requested, add_to_cart, and no_result.",
    parameters: {
      type: "object",
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
        },
        payload: {
          type: "object",
          additionalProperties: true,
        },
      },
      required: ["event_name"],
    },
  },
];
