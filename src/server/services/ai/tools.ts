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
        size: { type: "string", description: "Requested size, e.g. '44'" },
        min_price: { type: "number", description: "Minimum price filter" },
        max_price: { type: "number", description: "Maximum price filter" },
        category: { type: "string", description: "Category or type such as 'sneakers' or 'runner'" },
        color: { type: "string", description: "Color filter, e.g. 'black', 'white'" },
        product_type: { type: "string", description: "Normalized product type filter" },
        in_stock: { type: "boolean", description: "Only return in-stock products" },
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
      "Check whether a requested size is available for a specific product or the best matching retrieved product. Use this for questions like 'do you have dunks size 44'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional natural language product query when the exact handle is not known",
        },
        handle_or_id: {
          type: "string",
          description: "Optional product handle or Shopify product GID when the product is already known",
        },
        size: {
          type: "string",
          description: "Requested size value such as '44'",
        },
      },
      required: ["size"],
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
      "Resolve an exact variant from selected options like size and color when the specific product is already known.",
    parameters: {
      type: "object",
      properties: {
        handle_or_id: { type: "string", description: "Product handle or Shopify product GID" },
        selected_options: {
          type: "object",
          description: "Key-value pairs like { \"Size\": \"44\", \"Color\": \"Black\" }",
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
      "Check availability for a specific variant ID on a known product.",
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
