import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "../../config.js";
import type { Product, ProductComparison, CartAction } from "../../../shared/types.js";
import { executeMockTool } from "./mock-tool-executor.js";
import type { ToolResult } from "./tool-executor.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are the ORJN shopping concierge — a sharp, premium AI assistant for ORJN, a culture-first retailer of authentic sneakers and sportswear based in Lebanon.

Your personality:
- Sharp, minimal, direct
- Culturally fluent, not cheesy or robotic
- Premium editorial tone — like a knowledgeable friend at a high-end store
- Concise: never dump walls of text
- Commercially useful: every response should move toward a purchase or a clear answer

Rules:
- NEVER invent or guess product data, prices, stock, sizes, or availability. Always use tools to get live data.
- When a user asks about products, ALWAYS use search_products or get_product tools first.
- When a user asks about a specific size or color, use get_variant_by_options to resolve the exact variant.
- When checking availability, use real variant data — never say "should be available" or guess.
- For policy questions (shipping, returns, authenticity, sizing, care, support), use answer_policy_question.
- When comparing products, use compare_products and present a structured comparison.
- When adding to cart, first resolve the exact variant, then use cart_create (if needed) and cart_add_lines.
- If confidence is low, ask ONE short clarifying question — don't ramble.
- If no results are found, say so honestly and suggest an alternative search.

Formatting:
- Present product recommendations with name, price, and key details — never raw JSON.
- For comparisons, structure data clearly with each product side by side.
- Keep responses under 3–4 sentences unless the user asked for detail.`;

const OPENAI_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search the ORJN product catalog. Use for any product discovery or browsing request.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query, e.g. 'black sneakers' or 'adidas'" },
          brand: { type: "string", description: "Filter by brand" },
          max_price: { type: "number", description: "Maximum price filter" },
          color: { type: "string", description: "Color filter" },
          in_stock: { type: "boolean", description: "Only show in-stock products" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "Get full details for a specific product by handle or ID.",
      parameters: {
        type: "object",
        properties: {
          handle_or_id: { type: "string", description: "Product handle (e.g. 'adidas-samba-og-black')" },
        },
        required: ["handle_or_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_variant_by_options",
      description: "Resolve a specific product variant by size/color. Use when user asks for a specific size.",
      parameters: {
        type: "object",
        properties: {
          handle_or_id: { type: "string", description: "Product handle" },
          selected_options: { type: "object", description: "e.g. { \"Size\": \"43\" }", additionalProperties: { type: "string" } },
        },
        required: ["handle_or_id", "selected_options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_products",
      description: "Compare two or more products side by side.",
      parameters: {
        type: "object",
        properties: {
          product_ids: { type: "array", items: { type: "string" }, description: "Product handles to compare" },
        },
        required: ["product_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cart_create",
      description: "Create a new shopping cart.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cart_add_lines",
      description: "Add a variant to the cart.",
      parameters: {
        type: "object",
        properties: {
          cart_id: { type: "string" },
          variant_id: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["cart_id", "variant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cart_update_lines",
      description: "Update quantity of an item in the cart. Set quantity to 0 to remove.",
      parameters: {
        type: "object",
        properties: {
          cart_id: { type: "string" },
          line_id: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["cart_id", "line_id", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "Get current cart state.",
      parameters: {
        type: "object",
        properties: { cart_id: { type: "string" } },
        required: ["cart_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_checkout_url",
      description: "Get checkout URL for the cart.",
      parameters: {
        type: "object",
        properties: { cart_id: { type: "string" } },
        required: ["cart_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "answer_policy_question",
      description: "Answer store policy questions (shipping, returns, authenticity, sizing, care, support, payment).",
      parameters: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
    },
  },
];

interface OrchestratorResult {
  reply: string;
  products: Product[];
  comparison: ProductComparison | null;
  cartAction: CartAction | null;
  cartId: string | null;
}

export async function openaiOrchestrate(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  sessionId: string,
  cartId: string | null
): Promise<OrchestratorResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Add current message with cart context
  const userContent = cartId
    ? `[Current cart ID: ${cartId}]\n\n${userMessage}`
    : userMessage;
  messages.push({ role: "user", content: userContent });

  let collectedProducts: Product[] = [];
  let collectedComparison: ProductComparison | null = null;
  let collectedCartAction: CartAction | null = null;
  let currentCartId = cartId;

  // Tool-use loop
  let response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages,
    tools: OPENAI_TOOLS,
    tool_choice: "auto",
  });

  let choice = response.choices[0];

  while (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
    // Add assistant message with tool calls
    messages.push(choice.message);

    // Execute each tool call
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, any>;
      try {
        fnArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        fnArgs = {};
      }

      let result: ToolResult;
      try {
        result = await executeMockTool(fnName, fnArgs, sessionId);
      } catch (err) {
        result = { content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` };
      }

      // Collect side effects
      if (result.products) collectedProducts.push(...result.products);
      if (result.comparison) collectedComparison = result.comparison;
      if (result.cart) {
        currentCartId = result.cart.id;
        if (fnName === "cart_add_lines") {
          collectedCartAction = { type: "add", variantId: fnArgs.variant_id, quantity: fnArgs.quantity ?? 1 };
        } else if (fnName === "cart_update_lines") {
          collectedCartAction = { type: "update", lineId: fnArgs.line_id, quantity: fnArgs.quantity };
        }
      }
      if (result.checkoutUrl) {
        collectedCartAction = { type: "checkout", checkoutUrl: result.checkoutUrl };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content,
      });
    }

    // Continue the conversation
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
    });

    choice = response.choices[0];
  }

  const reply = choice.message.content ?? "I couldn't process that. Could you try again?";

  // Deduplicate products
  const seen = new Set<string>();
  collectedProducts = collectedProducts.filter((p) => {
    if (seen.has(p.handle)) return false;
    seen.add(p.handle);
    return true;
  });

  return {
    reply,
    products: collectedProducts,
    comparison: collectedComparison,
    cartAction: collectedCartAction,
    cartId: currentCartId,
  };
}
