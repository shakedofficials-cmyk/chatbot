import OpenAI from "openai";
import { env } from "../../config.js";
import { AI_TOOLS } from "./tools.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import { executeMockTool } from "./mock-tool-executor.js";
import { usesMockShopify } from "../../config.js";
import type { Product, ProductComparison, CartAction } from "../../../shared/types.js";

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

export async function openaiOrchestrate(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  sessionId: string,
  cartId: string | null
): Promise<OrchestratorResult> {
  const userContent = cartId
    ? `[Current cart ID: ${cartId}]\n\n${userMessage}`
    : userMessage;

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
          ? await executeMockTool(fnName, fnArgs, sessionId)
          : await executeTool(fnName, fnArgs, sessionId);
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
