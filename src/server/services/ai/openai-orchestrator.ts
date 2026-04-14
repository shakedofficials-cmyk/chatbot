import OpenAI from "openai";
import { env } from "../../config.js";
import { AI_TOOLS } from "./tools.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import { executeMockTool } from "./mock-tool-executor.js";
import { usesMockShopify } from "../../config.js";
import * as dbProducts from "../products/db-products.js";
import type { Product, ProductComparison, CartAction, ShopperPreferences } from "../../../shared/types.js";

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
- NEVER invent or guess product data, prices, stock, sizes, or availability. Always use catalog tools first.
- All product answers must be grounded in the synced ORJN catalog returned by tools. Do not answer from memory.
- When someone asks about products, ALWAYS use search_products or get_product first.
- For product availability by size, use get_size_availability when possible.
- For specific size/color combinations on a known product, use get_variant_by_options to resolve the exact variant.
- If the user says "this", "that one", "the first one", "the second one", "it", or follows up on products shown earlier, use the recent product context provided in the latest user message.
- Never say "should be available" or guess stock — use grounded variant or size availability data.
- For policy questions (shipping, returns, authenticity, sizing, care, support), use get_policy.
- When comparing products, use compare_products.
- When the user wants similar alternatives, use find_similar_products.
- When adding to cart, first resolve the exact variant, then use cart_create (if needed) and cart_add_lines.
- If you're not sure what they want, ask ONE short question — don't guess.
- Log relevant analytics events using log_event.

FORMAT — CRITICAL:
- The frontend automatically renders product cards with images, prices, and "Add to Cart" buttons from the tool results. You do NOT need to list product names, prices, or details in your text.
- When showing products, your text reply should be SHORT — just a brief intro like "here's what we got" or "check these out". The cards handle the rest. NEVER list products with numbers, bullets, or prices in your text — that creates ugly duplicate info.
- For comparisons, same thing — the frontend renders a comparison table. Just add a brief opinion.
- Do NOT use markdown bold (**text**) or any formatting. Write plain text only.
- Keep replies to 1-2 casual sentences when products are being shown alongside your message.`;

interface OrchestratorResult {
  reply: string;
  products: Product[];
  comparison: ProductComparison | null;
  cartAction: CartAction | null;
  cartId: string | null;
}

interface OrchestratorContext {
  recentProductHandles?: string[];
  preferences?: Record<string, unknown>;
}

function formatRecentProductContext(products: Product[]): string {
  if (products.length === 0) return "";

  return products
    .map((product, index) => {
      const availableSizes = product.variants
        .filter((variant) => variant.availableForSale)
        .flatMap((variant) =>
          variant.selectedOptions
            .filter((option) => option.name.toLowerCase() === "size")
            .map((option) => option.value)
        )
        .filter((value, valueIndex, all) => all.indexOf(value) === valueIndex)
        .slice(0, 8);

      return `${index + 1}. ${product.title} | handle=${product.handle} | brand=${product.vendor} | type=${product.productType} | price=${product.priceRange.minVariantPrice.amount} ${product.priceRange.minVariantPrice.currencyCode} | sizes=${availableSizes.join(", ") || "unknown"}`;
    })
    .join("\n");
}

function formatPreferenceContext(preferences: Record<string, unknown> | undefined): string {
  if (!preferences) return "";

  const known = preferences as ShopperPreferences;
  const lines = [
    known.favoriteBrand ? `favorite_brand=${known.favoriteBrand}` : null,
    known.preferredSize ? `preferred_size=${known.preferredSize}` : null,
    known.preferredCategory ? `preferred_category=${known.preferredCategory}` : null,
    known.preferredColor ? `preferred_color=${known.preferredColor}` : null,
    known.lastIntent ? `last_intent=${known.lastIntent}` : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "";
}

export async function openaiOrchestrate(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  sessionId: string,
  cartId: string | null,
  context: OrchestratorContext = {}
): Promise<OrchestratorResult> {
  const recentProducts = context.recentProductHandles?.length
    ? await dbProducts.getProductsByHandles(context.recentProductHandles.slice(-4))
    : [];
  const recentProductContext = formatRecentProductContext(recentProducts);
  const preferenceContext = formatPreferenceContext(context.preferences);

  const userContent = cartId
    ? `[Current cart ID: ${cartId}]\n${recentProductContext ? `\n[Recent product context]\n${recentProductContext}` : ""}${preferenceContext ? `\n[Shopper preferences]\n${preferenceContext}` : ""}\n\n${userMessage}`
    : `${recentProductContext ? `[Recent product context]\n${recentProductContext}\n\n` : ""}${preferenceContext ? `[Shopper preferences]\n${preferenceContext}\n\n` : ""}${userMessage}`;

  const input = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: userContent },
  ];

  let collectedProducts: Product[] = [];
  let collectedComparison: ProductComparison | null = null;
  let collectedCartAction: CartAction | null = null;
  let currentCartId = cartId;

  // Initial response
  let response = await openai.responses.create({
    model: env.OPENAI_MODEL,
    instructions: SYSTEM_PROMPT,
    input,
    tools: AI_TOOLS,
  } as any);

  // Tool-use loop — continue until no function_call items remain in output
  while ((response as any).output?.some((item: any) => item.type === "function_call")) {
    const toolOutputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];

    for (const item of (response as any).output as any[]) {
      if (item.type !== "function_call") continue;

      const fnName: string = item.name;
      let fnArgs: Record<string, any>;
      try {
        fnArgs = JSON.parse(item.arguments);
      } catch {
        fnArgs = {};
      }

      let result: ToolResult;
      try {
        result = usesMockShopify
          ? await executeMockTool(fnName, fnArgs, sessionId, context)
          : await executeTool(fnName, fnArgs, sessionId, context);
      } catch (err) {
        console.error("[chat] tool execution failed", {
          sessionId,
          toolName: fnName,
          usesMockShopify,
          args: fnArgs,
          error: err instanceof Error ? err.message : String(err),
        });
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

      toolOutputs.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: result.content,
      });
    }

    // Continue the conversation using previous_response_id
    response = await openai.responses.create({
      model: env.OPENAI_MODEL,
      previous_response_id: (response as any).id,
      input: toolOutputs,
      tools: AI_TOOLS,
    } as any);
  }

  // Extract final text from output
  const reply =
    ((response as any).output as any[])
      ?.filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("\n") || "I couldn't process that. Could you try again?";

  // Deduplicate products by handle
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
