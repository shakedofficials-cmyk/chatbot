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
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  color?: string;
  productType?: string;
  inStock?: boolean;
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
