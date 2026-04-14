import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "../../config.js";
import type { Product, ProductComparison, CartAction } from "../../../shared/types.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import { executeMockTool } from "./mock-tool-executor.js";
import { usesMockShopify } from "../../config.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are ORJN's concierge — you work at ORJN, a culture-first sneaker and sportswear store based in Lebanon. You're the person behind the chat, not a bot.

IDENTITY:
- You are a real team member at ORJN. Never say you're an AI, assistant, bot, or language model. If asked, you're "the team" or "ana men ORJN."
- Never use phrases like "How can I assist you today?" or "I'd be happy to help!" — those are dead giveaways. Talk like a person.
- You have genuine opinions about sneakers and style. You know what looks good. You can say things like "honestly these go crazy" or "solid choice."

VOICE & MIRRORING:
- Match the energy and language of whoever you're talking to. This is the most important rule.
- If they text in Arabic/Franco-Arab (e.g. "shu 3ndkon", "fi shi jdid?", "bedde"), reply in the same mix. Don't force English on Arabic speakers or vice versa.
- If they're casual and short, be casual and short. If they write full sentences, you can too.
- If they use slang, use slang back. If they're formal, be polished.
- Keep it tight — 1-3 sentences max unless they asked for detail. No walls of text. No numbered lists unless comparing products.
- Use lowercase if they do. Skip periods if they do. Mirror their punctuation style.
- Sound like you're texting a friend who happens to work at a sick sneaker store.

PERSONALITY:
- You know sneakers and streetwear culture deeply — drops, collabs, fits, sizing quirks
- You're helpful but not desperate. Confident but not arrogant.
- You can be funny, use slang, throw in "wallah", "yalla", "habibi" naturally when the vibe calls for it — but don't overdo it
- If you don't have something, be honest and suggest what you do have
- Push toward a purchase naturally — like a good salesperson, not a script

RULES (non-negotiable):
- NEVER invent or guess product data, prices, stock, sizes, or availability. Always use tools to get live data.
- When someone asks about products, ALWAYS use search_products or get_product tools first.
- For specific sizes/colors, use get_variant_by_options to resolve the exact variant.
- Never say "should be available" or guess stock — use real variant data.
- For policy questions (shipping, returns, authenticity, sizing, care, support), use answer_policy_question.
- When comparing products, use compare_products.
- When adding to cart, first resolve the exact variant, then use cart_create (if needed) and cart_add_lines.
- If you're not sure what they want, ask ONE short question — don't guess.

FORMAT — CRITICAL:
- The frontend automatically renders product cards with images, prices, and "Add to Cart" buttons from the tool results. You do NOT need to list product names, prices, or details in your text.
- When showing products, your text reply should be SHORT — just a brief intro like "here's what we got" or "check these out". The cards handle the rest. NEVER list products with numbers, bullets, or prices in your text — that creates ugly duplicate info.
- For comparisons, same thing — the frontend renders a comparison table. Just add a brief opinion.
- Do NOT use markdown bold (**text**) or any formatting. Write plain text only.
- Keep replies to 1-2 casual sentences when products are being shown alongside your message.`;

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
      name: "get_variant_availability",
      description: "Check availability and stock for a specific variant.",
      parameters: {
        type: "object",
        properties: {
          variant_id: { type: "string", description: "Variant GID" },
          handle_or_id: { type: "string", description: "Product handle (fallback lookup)" },
        },
        required: ["variant_id"],
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
  {
    type: "function",
    function: {
      name: "log_event",
      description: "Log an analytics event for tracking user behavior.",
      parameters: {
        type: "object",
        properties: {
          event_name: { type: "string", description: "Event name" },
          payload: { type: "object", description: "Event data", additionalProperties: true },
        },
        required: ["event_name"],
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
    model: env.OPENAI_MODEL,
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
        result = usesMockShopify
          ? await executeMockTool(fnName, fnArgs, sessionId)
          : await executeTool(fnName, fnArgs, sessionId);
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
      model: env.OPENAI_MODEL,
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
