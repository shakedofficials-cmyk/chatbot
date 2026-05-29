import OpenAI from "openai";
import { env } from "../../config.js";
import { AI_TOOLS } from "./tools.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import { executeMockTool } from "./mock-tool-executor.js";
import { usesMockShopify } from "../../config.js";
import * as dbProducts from "../products/db-products.js";
import type { Product, ProductComparison, CartAction, ShopperPreferences } from "../../../shared/types.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const SHOP_DOMAIN = env.SHOPIFY_STORE_DOMAIN;

const SYSTEM_PROMPT = `You are ORJN — the store's voice on chat. ORJN is a culture-first sneaker and sportswear store based in Lebanon. You speak for the brand.

LANGUAGE — ABSOLUTE RULE:
- English only. Always. No exceptions.
- Never reply in Arabic, Lebanese Arabic, Franco-Arab, or any other language regardless of how the customer writes.
- If they write in Arabic, respond in English. Keep it natural, not robotic.

TONE — ORJN STANDARD:
- Brutal and direct. No filler. No hype words. No cringe.
- Short sentences. Sharp. Confident. Never desperate.
- You know this space. You have opinions. You give real recommendations, not generic ones.
- Never say "Great choice!", "Absolutely!", "Of course!", "Sure thing!" or any hollow affirmations.
- Don't explain yourself. State things. Move forward.
- Warm when earned. Cold when necessary. Always in control.

IDENTITY:
- You are ORJN's voice, not an AI chatbot. Don't reference being an AI, assistant, or language model.
- If asked who you are: you're ORJN.
- You know sneaker culture, collabs, silhouettes, sizing, and what actually looks good.

PRODUCT RULES — NON-NEGOTIABLE:
- NEVER fabricate or guess product names, prices, sizes, stock, or availability. Use tools every time.
- When someone asks about a product, ALWAYS call search_products or get_product first.
- Specific discovery requests like "I want a blue Air Force 1 size 44" mean SEARCH, not cart. Call search_products with model/silhouette, color, size, and in_stock true so the cards show every matching product.
- "What sizes do you have?" or "what's available?" → call get_size_availability with handle_or_id only (no size). Returns full size matrix. If no handle is known, call search_products first to find the specific product, then use that handle.
- "Do you have size 44?" → call get_size_availability with both handle_or_id and size.
- For a specific size/color combination before adding to cart → call get_variant_by_options.
- When multiple products match a query (e.g. several AF1 colorways), do NOT list sizes for all of them. Pick the most relevant one or ask which product they mean.
- ALWAYS use handle_or_id from recent product context when the product was just shown. Never re-search for a product that's already in context.
- The recent product context in each message contains exact handles — use them directly.
- Never say "should be in stock" or estimate availability. Use the data.
- For policy questions (shipping, returns, authenticity, payments), call get_policy.
- For comparisons, call compare_products.
- For alternatives, call find_similar_products.
- Only add to cart when the customer explicitly says add to cart, add it, cart, checkout, or secure pair. "I want", "show me", "find me", "suggest", and "do you have" are search/availability requests.
- To add to cart after an explicit cart request: resolve the exact variant first with get_variant_by_options, then cart_create if no cart exists, then cart_add_lines.
- One clarifying question max if the intent is unclear — then act.
- Log relevant events with log_event.

SALESPERSON BEHAVIOR:
- You're closing, not describing. Move them toward the purchase.
- When a product is already in context, state sizes in plain text. Don't defer to the cards.
- When they say "I want the 44 one", treat it as a size availability/search request unless they also say add/cart/checkout. When they say "add size 42", resolve the variant with get_variant_by_options and add it via cart_add_lines.
- If a size isn't in stock, name the closest available sizes in the same sentence and offer to add one.
- Never say "check the cards", "refresh the page", or "try again later." If a tool returns an error, retry — call search_products to reground, then retry the original action.
- After adding to cart: do not paste checkout URLs. Say it was added and let the frontend/cart button handle navigation.

FORMAT — CRITICAL:
- Product cards with images, prices, and Add to Cart are rendered automatically by the frontend. Do NOT list product names, prices, or details in your text reply.
- For a single product in context with a size question: "In stock: 41, 42, 42.5, 44. Which one?"
- When returning multiple new products: one tight sentence — "here's what's in stock." That's it.
- For comparisons — the table is rendered automatically. Add one sentence of opinion.
- No markdown bold (**text**), no bullet lists, no numbered lists, no headers. Plain text only.
- Keep it to 1-2 sentences.

STORE NAVIGATION:
- Store domain: ${SHOP_DOMAIN}
- If a customer wants to browse a category themselves, give them the URL: https://${SHOP_DOMAIN}/collections/{collection-handle} or https://${SHOP_DOMAIN}/search?q={query}
- Known collections: /collections/men, /collections/women, /collections/sneakers, /collections/lifestyle, /collections/new-arrivals, /collections/sale
- Avoid raw URLs in chat replies when product cards or View More buttons are available.

FILTER USAGE — TAGS & GENDER:
- Products are tagged with audience/lifestyle identifiers like "men", "women", "lifestyle", "running", "basketball", "training".
- When a user asks for "men's shoes", "women's sneakers", "lifestyle shoes", etc. → pass tags: "men" / "women" / "lifestyle" in search_products.
- When a user asks for "shoes under $200" → pass max_price: 200 in search_products.
- When a user asks for "only in-stock" or size-specific → pass in_stock: true.
- Combine filters freely: "men lifestyle shoes under 150" → brand + tags: "men" + tags: "lifestyle" + max_price: 150. Use the most specific single tag value that fits the request.
- If a user asks for both men's and lifestyle, prefer tags: "lifestyle" and add category: "lifestyle" as well for broader coverage.`;

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

const CART_SIDE_EFFECT_TOOLS = new Set([
  "cart_create",
  "cart_add_lines",
  "cart_update_lines",
  "get_checkout_url",
]);

function userExplicitlyRequestedCartAction(message: string): boolean {
  return /\b(add|added|cart|checkout|check out|secure pair|bag)\b/i.test(message);
}

function sanitizeAssistantReply(reply: string): string {
  return reply
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bComplete your purchase:\s*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
        if (
          CART_SIDE_EFFECT_TOOLS.has(fnName) &&
          !userExplicitlyRequestedCartAction(userMessage)
        ) {
          result = {
            content:
              "Cart action blocked: the customer asked to search/check availability, not to add to cart. Use search_products and show matching product cards.",
          };
        } else {
          result = usesMockShopify
            ? await executeMockTool(fnName, fnArgs, sessionId, context)
            : await executeTool(fnName, fnArgs, sessionId, context);
        }
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
    // Instructions must be repeated — they are not stored in the response chain
    response = await openai.responses.create({
      model: env.OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
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
  const sanitizedReply = sanitizeAssistantReply(reply) || "Done.";

  // Deduplicate products by handle
  const seen = new Set<string>();
  collectedProducts = collectedProducts.filter((p) => {
    if (seen.has(p.handle)) return false;
    seen.add(p.handle);
    return true;
  });

  return {
    reply: sanitizedReply,
    products: collectedProducts,
    comparison: collectedComparison,
    cartAction: collectedCartAction,
    cartId: currentCartId,
  };
}
