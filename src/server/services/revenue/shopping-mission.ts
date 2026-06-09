import type {
  Product,
  QueryIntent,
  QueryUnderstanding,
  QuickReply,
  SearchFilters,
  ShopperProfilePreferences,
  ShoppingMission,
} from "../../../shared/types.js";

const PRODUCT_INTENTS = new Set<QueryIntent>([
  "product_search",
  "availability_check",
  "size_lookup",
  "recommendations",
]);

function isGenericShoeCategory(value: string | undefined): boolean {
  return Boolean(value && /^(shoe|shoes|sneaker|sneakers)$/i.test(value.trim()));
}

function hasSpecificStyle(filters: SearchFilters): boolean {
  const category = filters.category ?? filters.productType;
  return Boolean(
    filters.model ||
      filters.silhouette ||
      filters.brand ||
      (category && !isGenericShoeCategory(category)) ||
      filters.color
  );
}

function hasAudienceFilter(filters: SearchFilters): boolean {
  return Boolean(filters.gender || filters.tags);
}

function asksForSavedProfile(normalizedQuery: string): boolean {
  return /\b(?:my size|same size|usual size|in my size|for me|for myself|my pair)\b/i.test(normalizedQuery);
}

function primaryStyleSlot(filters: SearchFilters): string | undefined {
  return filters.silhouette ??
    filters.model ??
    (!isGenericShoeCategory(filters.category) ? filters.category : undefined) ??
    (!isGenericShoeCategory(filters.productType) ? filters.productType : undefined) ??
    filters.color ??
    filters.brand;
}

export function applyProfileToUnderstanding(
  understanding: QueryUnderstanding,
  profile: ShopperProfilePreferences
): QueryUnderstanding {
  if (!PRODUCT_INTENTS.has(understanding.intent)) return understanding;

  const filters: SearchFilters = { ...understanding.filters };
  const wasSpecific = hasSpecificStyle(filters);
  const hasAudience = hasAudienceFilter(filters);
  const shouldUseProfileAsHardFilter = asksForSavedProfile(understanding.normalizedQuery) ||
    (!wasSpecific && !hasAudience);

  if (!filters.size && profile.preferredSize && shouldUseProfileAsHardFilter) {
    filters.size = profile.preferredSize;
  }
  if (!filters.maxPrice && profile.preferredBudget && shouldUseProfileAsHardFilter) {
    filters.maxPrice = profile.preferredBudget;
  }
  if (!filters.gender && profile.preferredGender && shouldUseProfileAsHardFilter) {
    filters.gender = profile.preferredGender;
    filters.tags = filters.tags ?? profile.preferredGender;
  }

  if (!wasSpecific && !hasAudience) {
    if (!filters.brand && profile.favoriteBrands?.[0]) filters.brand = profile.favoriteBrands[0];
    if (
      profile.preferredCategories?.[0] &&
      (!filters.category || isGenericShoeCategory(filters.category)) &&
      (!filters.productType || isGenericShoeCategory(filters.productType))
    ) {
      filters.category = profile.preferredCategories[0];
      filters.productType = undefined;
    }
    if (!filters.color && profile.preferredColors?.[0]) filters.color = profile.preferredColors[0];
  }

  return {
    ...understanding,
    filters,
    entities: {
      ...understanding.entities,
      brand: filters.brand,
      model: filters.model,
      silhouette: filters.silhouette,
      size: filters.size,
      color: filters.color,
      category: filters.category,
      gender: filters.gender,
      tags: filters.tags,
      searchTerm: understanding.entities.searchTerm ?? primaryStyleSlot(filters),
    },
  };
}

export function buildShoppingMission(understanding: QueryUnderstanding): ShoppingMission {
  if (!PRODUCT_INTENTS.has(understanding.intent)) {
    return { confidence: 1, missingSlots: [] };
  }

  const missingSlots: string[] = [];
  const hasStyleOrAudience = hasSpecificStyle(understanding.filters) ||
    hasAudienceFilter(understanding.filters);

  if (!hasStyleOrAudience) {
    missingSlots.push("style");
    if (!understanding.filters.size) missingSlots.push("size");
    if (!understanding.filters.maxPrice) missingSlots.push("budget");
  }

  const confidence = Math.max(0.25, Math.min(1, 1 - missingSlots.length * 0.22));
  return { confidence, missingSlots };
}

export function missionQuestion(mission: ShoppingMission): string | null {
  if (mission.confidence >= 0.78 || mission.missingSlots.length === 0) return null;
  const slot = mission.missingSlots[0];
  if (slot === "style") return "What kind of pair are we finding?";
  if (slot === "size") return "What size should I lock on?";
  if (slot === "budget") return "What budget should I stay under?";
  return "What should I filter first?";
}

function withPrompt(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function buildQuickReplies(params: {
  mission: ShoppingMission;
  filters: SearchFilters;
  products: Product[];
  whatsappEnabled: boolean;
}): QuickReply[] {
  const { mission, filters, products, whatsappEnabled } = params;
  const replies: QuickReply[] = [];

  if (products.length > 0) {
    if (filters.size) {
      const productHandle = products[0]?.handle;
      replies.push({
        label: `Secure size ${filters.size}`,
        prompt: productHandle
          ? `Add size ${filters.size} to cart for ${productHandle}`
          : `Add size ${filters.size} to cart`,
        action: productHandle
          ? {
              type: "add_to_cart",
              productHandle,
              size: filters.size,
            }
          : undefined,
      });
    }
    if (products.length >= 2) replies.push({ label: "Compare top 2", prompt: "Compare the top 2" });
    replies.push({ label: "Show similar", prompt: "Show me similar options" });
    if (whatsappEnabled) replies.push({ label: "Ask WhatsApp", prompt: "Connect me to an agent" });
    return replies.slice(0, 4);
  }

  const slot = mission.missingSlots[0];
  if (slot === "style") {
    return [
      { label: "Lifestyle", prompt: withPrompt(["Show me lifestyle shoes", filters.size ? `size ${filters.size}` : undefined]) },
      { label: "Running", prompt: withPrompt(["Show me running shoes", filters.size ? `size ${filters.size}` : undefined]) },
      { label: "Football", prompt: withPrompt(["Show me football shoes", filters.size ? `size ${filters.size}` : undefined]) },
      { label: "Basketball", prompt: withPrompt(["Show me basketball shoes", filters.size ? `size ${filters.size}` : undefined]) },
    ];
  }

  if (slot === "size") {
    return ["40", "41", "42", "43", "44", "45"].slice(0, 4).map((size) => ({
      label: `Size ${size}`,
      prompt: withPrompt(["Show me", primaryStyleSlot(filters) ?? "shoes", `size ${size}`]),
    }));
  }

  if (slot === "budget") {
    return [
      { label: "Under $150", prompt: withPrompt(["Show me", primaryStyleSlot(filters) ?? "shoes", "under $150"]) },
      { label: "Under $200", prompt: withPrompt(["Show me", primaryStyleSlot(filters) ?? "shoes", "under $200"]) },
      { label: "Under $250", prompt: withPrompt(["Show me", primaryStyleSlot(filters) ?? "shoes", "under $250"]) },
      { label: "Any budget", prompt: withPrompt(["Show me", primaryStyleSlot(filters) ?? "shoes"]) },
    ];
  }

  return replies;
}
