import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import { env } from "../../config.js";
import { AI_TOOLS } from "./tools.js";
import { executeTool, type ToolResult } from "./tool-executor.js";
import type { ChatMessage, Product, ProductComparison, CartAction } from "../../../shared/types.js";
import { nanoid } from "nanoid";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
- Log relevant analytics events using log_event.

Formatting:
- Present product recommendations with name, price, and key details — never raw JSON.
- For comparisons, structure data clearly with each product side by side.
- Keep responses under 3–4 sentences unless the user asked for detail.
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
    model: "claude-sonnet-4-20250514",
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
      model: "claude-sonnet-4-20250514",
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
