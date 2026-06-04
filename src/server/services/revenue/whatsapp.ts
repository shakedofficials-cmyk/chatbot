import type {
  ChatAction,
  PageContext,
  Product,
  ProductInsight,
  QueryIntent,
  SearchFilters,
} from "../../../shared/types.js";
import { findBestVariantMatch } from "../size-resolution.js";

export interface WhatsAppActionInput {
  whatsappNumber: string;
  userMessage: string;
  products: Product[];
  productInsights?: ProductInsight[];
  filters: SearchFilters;
  pageContext?: PageContext;
  cartId?: string | null;
  intent: QueryIntent;
  hasComparison?: boolean;
}

function normalizeWhatsAppNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function buildWhatsAppUrl(number: string, message: string): string | null {
  const normalized = normalizeWhatsAppNumber(number);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function isHumanHandoffRequest(message: string): boolean {
  return /\b(whatsapp|contact|support|help|human|person|agent|representative|staff|team|someone|call|dm|message you|talk|customer service|live chat|real person)\b/i.test(message);
}

function isHesitating(message: string): boolean {
  return /\b(not sure|unsure|which|better|choose|recommend|worth it|opinion|help me pick)\b/i.test(message);
}

function hasExactRequestedSize(products: Product[], size: string | undefined): boolean {
  if (!size) return true;
  return products.some((product) => findBestVariantMatch(product.variants, size).exactMatchAvailable);
}

function compactContext(input: WhatsAppActionInput): string {
  const productHandles = input.products.slice(0, 3).map((product) => product.handle).join(", ");
  const parts = [
    "Hi ORJN, I need help from the chat.",
    `Asked: ${input.userMessage}`,
    input.filters.size ? `Size: ${input.filters.size}` : null,
    input.filters.color ? `Color: ${input.filters.color}` : null,
    input.filters.category ?? input.filters.productType ? `Type: ${input.filters.category ?? input.filters.productType}` : null,
    productHandles ? `Products: ${productHandles}` : null,
    input.pageContext?.type ? `Page: ${input.pageContext.type}${input.pageContext.handle ? `/${input.pageContext.handle}` : ""}` : null,
    input.cartId ? "Cart: active" : null,
  ].filter(Boolean);

  return parts.join("\n");
}

export function buildWhatsAppActions(input: WhatsAppActionInput): ChatAction[] {
  if (!input.whatsappNumber.trim()) return [];

  const noResults = input.products.length === 0;
  const sizeMiss = !hasExactRequestedSize(input.products, input.filters.size);
  const humanRequest = isHumanHandoffRequest(input.userMessage);
  const shouldShow =
    humanRequest ||
    isHesitating(input.userMessage) ||
    input.hasComparison ||
    noResults ||
    sizeMiss ||
    Boolean(input.cartId && /\b(cart|add|added|checkout|buy|secure)\b/i.test(input.userMessage));

  if (!shouldShow) return [];

  const url = buildWhatsAppUrl(input.whatsappNumber, compactContext(input));
  if (!url) return [];

  const label = humanRequest
    ? "Chat on WhatsApp"
    : noResults || sizeMiss
    ? "Ask ORJN on WhatsApp"
    : input.cartId
      ? "Finish on WhatsApp"
      : "Chat on WhatsApp";

  return [{ type: "whatsapp", label, url }];
}
