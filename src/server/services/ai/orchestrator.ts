import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import { env } from "../../config.js";
import { AI_TOOLS } from "./tools.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import type { ChatMessage, Product, ProductComparison, CartAction } from "../../../shared/types.js";
import { nanoid } from "nanoid";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
- Keep it tight — 1-3 sentences max unless they asked for detail. Mirror their punctuation style.
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
- Keep replies to 1-2 casual sentences when products are being shown alongside your message.
- Use product handles when referencing products so the frontend can link them.`;

interface OrchestratorResult {
  reply: string;
  products: Product[];
  comparison: ProductComparison | null;
  cartAction: CartAction | null;
  cartId: string | null;
}

export async function orchestrate(
  userMessage: string,
  conversationHistory: MessageParam[],
  sessionId: string,
  cartId: string | null
): Promise<OrchestratorResult> {
  const messages: MessageParam[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  // Add cart context if available
  if (cartId) {
    const lastUserMsg = messages[messages.length - 1];
    if (typeof lastUserMsg.content === "string") {
      messages[messages.length - 1] = {
        role: "user",
        content: `[Current cart ID: ${cartId}]\n\n${lastUserMsg.content}`,
      };
    }
  }

  let collectedProducts: Product[] = [];
  let collectedComparison: ProductComparison | null = null;
  let collectedCartAction: CartAction | null = null;
  let currentCartId = cartId;

  // Tool-use loop — keep calling until we get a final text response
  let response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: AI_TOOLS,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: ContentBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      let result: ToolResult;
      try {
        result = await executeTool(block.name, block.input as Record<string, any>, sessionId);
      } catch (err) {
        result = {
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }

      // Collect side effects
      if (result.products) collectedProducts.push(...result.products);
      if (result.comparison) collectedComparison = result.comparison;
      if (result.cart) {
        currentCartId = result.cart.id;

        // Determine cart action type
        if (block.name === "cart_add_lines") {
          collectedCartAction = {
            type: "add",
            variantId: (block.input as any).variant_id,
            quantity: (block.input as any).quantity ?? 1,
          };
        } else if (block.name === "cart_update_lines") {
          collectedCartAction = {
            type: "update",
            lineId: (block.input as any).line_id,
            quantity: (block.input as any).quantity,
          };
        }
      }
      if (result.checkoutUrl) {
        collectedCartAction = {
          type: "checkout",
          checkoutUrl: result.checkoutUrl,
        };
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
      } as any);
    }

    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
<<<<<<< HEAD
      model: env.ANTHROPIC_MODEL,
=======
      model: "claude-sonnet-4-6",
>>>>>>> 8c0fb46 (Fix OpenAI orchestrator using mock tools in production and update Anthropic model ID)
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: AI_TOOLS,
      messages,
    });
  }

  // Extract final text
  const reply = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("\n");

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
