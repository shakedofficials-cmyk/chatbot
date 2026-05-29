// ── Product types ──

export interface ProductImage {
  url: string;
  altText: string | null;
  width?: number;
  height?: number;
}

export interface ProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number | null;
  price: Money;
  compareAtPrice: Money | null;
  selectedOptions: SelectedOption[];
  image: ProductImage | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  priceRange: PriceRange;
  metafields: ProductMetafields;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Money {
  amount: string;
  currencyCode: string;
}

export interface PriceRange {
  minVariantPrice: Money;
  maxVariantPrice: Money;
}

export interface ProductMetafields {
  fitProfile?: string;
  trueToSizeNote?: string;
  authenticityNote?: string;
  styleTags?: string[];
  materialSummary?: string;
  recommendedUse?: string;
  compareHighlights?: string;
  customColor?: string;
  lifestyleType?: string;
  basketballType?: string;
  runningType?: string;
  trainingType?: string;
}

// ── Cart types ──

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  lines: CartLine[];
  cost: CartCost;
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandise: {
    id: string;
    title: string;
    product: {
      title: string;
      handle: string;
    };
    image: ProductImage | null;
    price: Money;
    selectedOptions: SelectedOption[];
  };
}

export interface CartCost {
  totalAmount: Money;
  subtotalAmount: Money;
}

// ── Search types ──

export interface SearchFilters {
  brand?: string;
  model?: string;
  silhouette?: string;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  color?: string;
  size?: string;
  productType?: string;
  gender?: string;
  inStock?: boolean;
  tags?: string;
}

export type QueryIntent =
  | "product_search"
  | "availability_check"
  | "size_lookup"
  | "recommendations"
  | "comparison"
  | "policy_support"
  | "authenticity"
  | "general_chat";

export interface QueryUnderstanding {
  normalizedQuery: string;
  intent: QueryIntent;
  filters: SearchFilters;
  entities: {
    brand?: string;
    model?: string;
    silhouette?: string;
    size?: string;
    color?: string;
    category?: string;
    gender?: string;
    tags?: string;
    styleTerms: string[];
    rawTerms: string[];
  };
}

export interface RetrievedProduct {
  product: Product;
  lexicalScore: number;
  semanticScore: number;
  rerankScore: number;
  reasoning: string[];
}

export interface HybridSearchResult {
  understanding: QueryUnderstanding;
  lexicalCandidates: { productId: string; score: number }[];
  semanticCandidates: { productId: string; score: number }[];
  results: RetrievedProduct[];
}

export interface ShopperPreferences {
  favoriteBrand?: string;
  preferredSize?: string;
  preferredCategory?: string;
  preferredColor?: string;
  lastIntent?: QueryIntent;
}

// ── Comparison types ──

export interface ProductComparison {
  products: Product[];
  comparison: {
    prices: { handle: string; price: string; compareAtPrice: string | null }[];
    availableSizes: { handle: string; sizes: string[] }[];
    brands: { handle: string; brand: string }[];
    productTypes: { handle: string; type: string }[];
    materials: { handle: string; material: string | null }[];
    recommendations: string;
  };
}

// ── Chat types ──

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: Product[];
  comparison?: ProductComparison;
  cartAction?: CartAction;
  viewAllUrl?: string;
  timestamp: number;
}

export interface CartAction {
  type: "add" | "update" | "remove" | "checkout";
  variantId?: string;
  lineId?: string;
  quantity?: number;
  checkoutUrl?: string;
  productTitle?: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  cartId?: string;
}

export interface ChatResponse {
  sessionId: string;
  message: ChatMessage;
  cartId?: string;
}

// ── Analytics types ──

export type AnalyticsEventName =
  | "chat_opened"
  | "first_message_sent"
  | "product_search"
  | "product_clicked"
  | "comparison_requested"
  | "add_to_cart"
  | "checkout_started"
  | "fallback_triggered"
  | "no_result"
  | "policy_question"
  | "size_availability_requested";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  sessionId: string;
  payload?: Record<string, unknown>;
}
