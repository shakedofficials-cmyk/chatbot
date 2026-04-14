import type { CartAction, ChatResponse, Product, ProductComparison } from "../shared/types";

declare global {
  interface Window {
    __ORJN_CONFIG__?: {
      apiUrl?: string;
      shopDomain?: string;
    };
  }
}

type Role = "user" | "assistant";

interface WidgetConfig {
  apiBaseUrl: string;
  shopDomain?: string;
}

const STYLE_ID = "orjn-concierge-styles";
const ROOT_ID = "orjn-concierge-root";

function getConfig(): WidgetConfig {
  const runtimeConfig = window.__ORJN_CONFIG__;
  const configuredApiUrl =
    runtimeConfig?.apiUrl?.trim() || import.meta.env.VITE_API_URL?.trim() || window.location.origin;

  return {
    apiBaseUrl: configuredApiUrl.replace(/\/+$/, ""),
    shopDomain: runtimeConfig?.shopDomain,
  };
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      --orjn-bg: #0a0a0a;
      --orjn-bg-elevated: #141414;
      --orjn-bg-soft: #1a1a1a;
      --orjn-border: rgba(255, 255, 255, 0.12);
      --orjn-border-strong: rgba(255, 255, 255, 0.22);
      --orjn-text: #f5f1e8;
      --orjn-text-muted: rgba(245, 241, 232, 0.62);
      --orjn-text-subtle: rgba(245, 241, 232, 0.42);
      --orjn-accent: #efe6d5;
      --orjn-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
      --orjn-radius: 10px;
    }

    #orjn-concierge-shell {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 2147483647;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: var(--orjn-text);
    }

    #orjn-launcher {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      border: 1px solid var(--orjn-border-strong);
      border-radius: 12px;
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.12), transparent 52%),
        linear-gradient(145deg, #181818, #060606);
      color: var(--orjn-text);
      box-shadow: var(--orjn-shadow);
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, opacity 160ms ease;
    }

    #orjn-launcher:hover,
    #orjn-launcher:focus-visible {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.36);
      outline: none;
    }

    #orjn-panel {
      width: min(420px, calc(100vw - 28px));
      height: min(720px, calc(100vh - 28px));
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--orjn-border);
      border-radius: 18px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), transparent 18%),
        linear-gradient(180deg, #0f0f0f 0%, #090909 100%);
      box-shadow: var(--orjn-shadow);
      backdrop-filter: blur(14px);
    }

    #orjn-panel.open {
      display: flex;
      animation: orjn-panel-enter 180ms ease;
    }

    .orjn-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 18px 16px;
      border-bottom: 1px solid var(--orjn-border);
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
    }

    .orjn-header-copy p {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.28em;
      font-size: 10px;
      color: var(--orjn-text-subtle);
    }

    .orjn-header-copy h2 {
      margin: 7px 0 0;
      font-size: 18px;
      line-height: 1.1;
      font-weight: 600;
      color: var(--orjn-text);
    }

    .orjn-close {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 999px;
      background: transparent;
      color: var(--orjn-text-muted);
      cursor: pointer;
      transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
    }

    .orjn-close:hover,
    .orjn-close:focus-visible {
      background: rgba(255, 255, 255, 0.06);
      border-color: var(--orjn-border);
      color: var(--orjn-text);
      outline: none;
    }

    .orjn-messages {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px;
      overflow-y: auto;
      background:
        radial-gradient(circle at top right, rgba(239, 230, 213, 0.06), transparent 28%),
        linear-gradient(180deg, rgba(255,255,255,0.015), transparent 40%);
    }

    .orjn-empty {
      margin: auto 0;
      padding: 28px 12px;
    }

    .orjn-empty p {
      margin: 0;
      color: var(--orjn-text-muted);
      font-size: 13px;
      line-height: 1.65;
      max-width: 280px;
    }

    .orjn-empty strong {
      display: block;
      margin-bottom: 8px;
      color: var(--orjn-text);
      font-size: 18px;
      font-weight: 600;
    }

    .orjn-msg {
      max-width: 88%;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .orjn-msg.user {
      align-self: flex-end;
      padding: 12px 14px;
      border-radius: 12px 12px 4px 12px;
      background: linear-gradient(180deg, #1c1c1c 0%, #141414 100%);
      border: 1px solid rgba(255, 255, 255, 0.07);
      color: var(--orjn-text);
    }

    .orjn-msg.assistant {
      align-self: flex-start;
      color: var(--orjn-text);
      padding-right: 14px;
    }

    .orjn-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .orjn-product {
      border: 1px solid var(--orjn-border);
      border-radius: var(--orjn-radius);
      overflow: hidden;
      background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
    }

    .orjn-product img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      background: #111;
    }

    .orjn-product-info {
      padding: 14px;
    }

    .orjn-product-vendor {
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 10px;
      color: var(--orjn-text-subtle);
    }

    .orjn-product-title {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 1.4;
      color: var(--orjn-text);
    }

    .orjn-product-price {
      display: flex;
      gap: 8px;
      align-items: baseline;
      color: var(--orjn-text);
      font-size: 13px;
      font-weight: 600;
    }

    .orjn-product-price .compare {
      color: var(--orjn-text-subtle);
      text-decoration: line-through;
      font-weight: 400;
      font-size: 12px;
    }

    .orjn-meta {
      margin-top: 9px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--orjn-text-muted);
    }

    .orjn-product-btn,
    .orjn-checkout-btn,
    .orjn-retry-btn,
    .orjn-send {
      border: 0;
      cursor: pointer;
      transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
    }

    .orjn-product-btn,
    .orjn-checkout-btn {
      width: calc(100% - 24px);
      margin: 0 12px 12px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--orjn-accent);
      color: #111;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      text-align: center;
    }

    .orjn-product-btn:hover,
    .orjn-checkout-btn:hover,
    .orjn-send:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .orjn-comparison {
      overflow: hidden;
      border: 1px solid var(--orjn-border);
      border-radius: var(--orjn-radius);
      background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
    }

    .orjn-comparison-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .orjn-comparison-table th,
    .orjn-comparison-table td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--orjn-border);
    }

    .orjn-comparison-table th {
      color: var(--orjn-text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 10px;
      font-weight: 600;
    }

    .orjn-comparison-table td {
      color: var(--orjn-text-muted);
      line-height: 1.55;
    }

    .orjn-comparison-table td:first-child {
      color: var(--orjn-text);
      width: 86px;
      font-weight: 600;
    }

    .orjn-comparison-note {
      padding: 12px;
      color: var(--orjn-text-muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .orjn-typing {
      display: flex;
      gap: 6px;
      padding: 8px 2px;
    }

    .orjn-typing span {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: rgba(245, 241, 232, 0.55);
      animation: orjn-pulse 1.1s ease-in-out infinite;
    }

    .orjn-typing span:nth-child(2) {
      animation-delay: 120ms;
    }

    .orjn-typing span:nth-child(3) {
      animation-delay: 240ms;
    }

    .orjn-error {
      display: none;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid rgba(202, 92, 92, 0.28);
      background: rgba(202, 92, 92, 0.09);
      color: #f0b9b9;
      font-size: 12px;
      line-height: 1.5;
    }

    .orjn-retry-btn {
      flex-shrink: 0;
      padding: 8px 12px;
      border-radius: 999px;
      background: transparent;
      border: 1px solid rgba(240, 185, 185, 0.4);
      color: inherit;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .orjn-input-area {
      display: flex;
      gap: 10px;
      align-items: flex-end;
      padding: 14px;
      border-top: 1px solid var(--orjn-border);
      background: rgba(255, 255, 255, 0.02);
    }

    .orjn-input {
      width: 100%;
      min-height: 46px;
      max-height: 140px;
      resize: none;
      border: 1px solid var(--orjn-border);
      border-radius: 12px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--orjn-text);
      font: inherit;
      line-height: 1.5;
    }

    .orjn-input::placeholder {
      color: var(--orjn-text-subtle);
    }

    .orjn-input:focus-visible {
      outline: 1px solid rgba(239, 230, 213, 0.4);
      border-color: rgba(239, 230, 213, 0.4);
    }

    .orjn-send {
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: var(--orjn-accent);
      color: #111;
      font-size: 17px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .orjn-send[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }

    @keyframes orjn-pulse {
      0%, 80%, 100% { opacity: 0.3; }
      40% { opacity: 1; }
    }

    @keyframes orjn-panel-enter {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 640px) {
      #orjn-concierge-shell {
        right: 12px;
        bottom: 12px;
      }

      #orjn-panel.open {
        width: calc(100vw - 24px);
        height: min(82vh, 720px);
      }
    }

    @media (max-width: 480px) {
      #orjn-concierge-shell {
        right: 0;
        bottom: 0;
      }

      #orjn-launcher {
        position: fixed;
        right: 14px;
        bottom: 14px;
      }

      #orjn-panel.open {
        width: 100vw;
        height: 100dvh;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
        border-bottom: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function createButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderPrice(price?: Product["priceRange"]["minVariantPrice"], compareAt?: Product["variants"][0]["compareAtPrice"] | null): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "orjn-product-price";
  wrap.append(`${price ? `${price.amount} ${price.currencyCode}` : ""}`);

  if (compareAt) {
    const compare = document.createElement("span");
    compare.className = "compare";
    compare.textContent = `${compareAt.amount} ${compareAt.currencyCode}`;
    wrap.appendChild(compare);
  }

  return wrap;
}

function createStaticIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
  svg.appendChild(path);
  return svg;
}

class ORJNConciergeWidget {
  private readonly config = getConfig();
  private readonly sessionId = createSessionId();

  private cartId: string | null = null;
  private lastMessage = "";
  private isLoading = false;
  private hasLoggedOpen = false;

  private readonly shell: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly messages: HTMLDivElement;
  private readonly emptyState: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly errorBar: HTMLDivElement;
  private readonly errorText: HTMLSpanElement;

  constructor(container: HTMLElement) {
    ensureStyles();

    this.shell = document.createElement("div");
    this.shell.id = "orjn-concierge-shell";

    this.launcher = createButton("", "", () => this.openChat());
    this.launcher.id = "orjn-launcher";
    this.launcher.setAttribute("aria-label", "Open ORJN Concierge");
    this.launcher.appendChild(createStaticIcon());

    this.panel = document.createElement("div");
    this.panel.id = "orjn-panel";

    const header = document.createElement("div");
    header.className = "orjn-header";

    const headerCopy = document.createElement("div");
    headerCopy.className = "orjn-header-copy";
    const eyebrow = document.createElement("p");
    eyebrow.textContent = "ORJN Concierge";
    const title = document.createElement("h2");
    title.textContent = "Original heat, minus the guesswork";
    headerCopy.append(eyebrow, title);

    const close = createButton("x", "orjn-close", () => this.closeChat());
    close.setAttribute("aria-label", "Close ORJN Concierge");

    header.append(headerCopy, close);

    this.messages = document.createElement("div");
    this.messages.className = "orjn-messages";

    this.emptyState = document.createElement("div");
    this.emptyState.className = "orjn-empty";
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "Ask for product picks, sizes, pricing, or policy details.";
    const emptyBody = document.createElement("p");
    emptyBody.textContent = "Keep it natural. We will search live catalog data for product and cart answers, not guess.";
    this.emptyState.append(emptyTitle, emptyBody);
    this.messages.appendChild(this.emptyState);

    this.errorBar = document.createElement("div");
    this.errorBar.className = "orjn-error";
    this.errorText = document.createElement("span");
    const retry = createButton("Retry", "orjn-retry-btn", () => this.retryLast());
    this.errorBar.append(this.errorText, retry);

    const inputArea = document.createElement("div");
    inputArea.className = "orjn-input-area";

    this.input = document.createElement("textarea");
    this.input.className = "orjn-input";
    this.input.rows = 1;
    this.input.placeholder = "Ask about products, sizes, or policies...";
    this.input.addEventListener("input", () => this.autoResizeInput());
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.sendMessage();
      }
    });

    this.sendButton = createButton("↑", "orjn-send", () => {
      void this.sendMessage();
    });
    this.sendButton.setAttribute("aria-label", "Send message");

    inputArea.append(this.input, this.sendButton);
    this.panel.append(header, this.messages, this.errorBar, inputArea);
    this.shell.append(this.launcher, this.panel);
    container.appendChild(this.shell);
  }

  private autoResizeInput(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`;
  }

  private async logAnalytics(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    try {
      await fetch(`${this.config.apiBaseUrl}/api/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          name,
          payload: {
            ...payload,
            shopDomain: this.config.shopDomain,
          },
        }),
      });
    } catch {
      // Analytics should never interrupt the storefront experience.
    }
  }

  private openChat(): void {
    this.launcher.style.display = "none";
    this.panel.classList.add("open");
    this.input.focus();

    if (!this.hasLoggedOpen) {
      this.hasLoggedOpen = true;
      void this.logAnalytics("chat_opened");
    }
  }

  private closeChat(): void {
    this.panel.classList.remove("open");
    this.launcher.style.display = "grid";
  }

  private setLoadingState(isLoading: boolean): void {
    this.isLoading = isLoading;
    this.sendButton.disabled = isLoading;
  }

  private hideEmptyState(): void {
    this.emptyState.style.display = "none";
  }

  private hideError(): void {
    this.errorBar.style.display = "none";
  }

  private showError(message: string): void {
    this.errorText.textContent = message;
    this.errorBar.style.display = "flex";
  }

  private scrollToBottom(): void {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private appendTextMessage(role: Role, text: string): void {
    const message = document.createElement("div");
    message.className = `orjn-msg ${role}`;
    message.textContent = text;
    this.messages.appendChild(message);
  }

  private renderProduct(product: Product): HTMLElement {
    const card = document.createElement("article");
    card.className = "orjn-product";

    if (product.images[0]) {
      const image = document.createElement("img");
      image.src = product.images[0].url;
      image.alt = product.images[0].altText || product.title;
      image.loading = "lazy";
      card.appendChild(image);
    }

    const info = document.createElement("div");
    info.className = "orjn-product-info";

    const vendor = document.createElement("div");
    vendor.className = "orjn-product-vendor";
    vendor.textContent = product.vendor || "ORJN";

    const title = document.createElement("h3");
    title.className = "orjn-product-title";
    title.textContent = product.title;

    const compareAtPrice = product.variants.find((variant) => variant.compareAtPrice)?.compareAtPrice ?? null;
    info.append(vendor, title, renderPrice(product.priceRange.minVariantPrice, compareAtPrice));

    const inStockSizes = product.variants
      .filter((variant) => variant.availableForSale)
      .flatMap((variant) =>
        variant.selectedOptions
          .filter((option) => option.name.toLowerCase() === "size")
          .map((option) => option.value)
      );

    if (inStockSizes.length > 0) {
      const meta = document.createElement("div");
      meta.className = "orjn-meta";
      meta.textContent = `In stock sizes: ${Array.from(new Set(inStockSizes)).slice(0, 6).join(", ")}`;
      info.appendChild(meta);
    }

    card.appendChild(info);

    const action = createButton("Check sizes in chat", "orjn-product-btn", () => {
      void this.logAnalytics("product_clicked", { productHandle: product.handle });
      this.input.value = `What sizes do you have for ${product.title}?`;
      this.autoResizeInput();
      void this.sendMessage();
    });
    card.appendChild(action);

    return card;
  }

  private renderComparison(comparison: ProductComparison): HTMLElement {
    const wrapper = document.createElement("section");
    wrapper.className = "orjn-comparison";

    const table = document.createElement("table");
    table.className = "orjn-comparison-table";

    const headerRow = document.createElement("tr");
    headerRow.appendChild(document.createElement("th"));
    comparison.products.forEach((product) => {
      const th = document.createElement("th");
      th.textContent = product.title;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    const availableSizes = new Map(
      comparison.comparison.availableSizes.map((entry) => [entry.handle, entry.sizes.join(", ") || "-"])
    );
    const brands = new Map(comparison.comparison.brands.map((entry) => [entry.handle, entry.brand || "-"]));
    const prices = new Map(comparison.comparison.prices.map((entry) => [entry.handle, entry.price || "-"]));
    const productTypes = new Map(comparison.comparison.productTypes.map((entry) => [entry.handle, entry.type || "-"]));
    const materials = new Map(comparison.comparison.materials.map((entry) => [entry.handle, entry.material || "-"]));

    const rows: Array<{ label: string; lookup: (handle: string) => string }> = [
      { label: "Brand", lookup: (handle) => brands.get(handle) || "-" },
      { label: "Price", lookup: (handle) => prices.get(handle) || "-" },
      { label: "Sizes", lookup: (handle) => availableSizes.get(handle) || "-" },
      { label: "Type", lookup: (handle) => productTypes.get(handle) || "-" },
      { label: "Material", lookup: (handle) => materials.get(handle) || "-" },
    ];

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = row.label;
      tr.appendChild(labelCell);

      comparison.products.forEach((product) => {
        const valueCell = document.createElement("td");
        valueCell.textContent = row.lookup(product.handle);
        tr.appendChild(valueCell);
      });

      table.appendChild(tr);
    });

    wrapper.appendChild(table);

    if (comparison.comparison.recommendations) {
      const note = document.createElement("div");
      note.className = "orjn-comparison-note";
      note.textContent = comparison.comparison.recommendations;
      wrapper.appendChild(note);
    }

    return wrapper;
  }

  private appendAssistantPayload(
    text: string,
    products?: Product[],
    comparison?: ProductComparison,
    cartAction?: CartAction
  ): void {
    this.appendTextMessage("assistant", text);

    if (products && products.length > 0) {
      const stack = document.createElement("div");
      stack.className = "orjn-stack";
      products.slice(0, 4).forEach((product) => stack.appendChild(this.renderProduct(product)));
      this.messages.appendChild(stack);
    }

    if (comparison) {
      this.messages.appendChild(this.renderComparison(comparison));
    }

    if (cartAction?.type === "checkout" && cartAction.checkoutUrl) {
      const link = document.createElement("a");
      link.className = "orjn-checkout-btn";
      link.href = cartAction.checkoutUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Proceed to checkout";
      this.messages.appendChild(link);
    }

    this.scrollToBottom();
  }

  private showTyping(): HTMLDivElement {
    const typing = document.createElement("div");
    typing.className = "orjn-typing";
    typing.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    this.messages.appendChild(typing);
    this.scrollToBottom();
    return typing;
  }

  private async retryLast(): Promise<void> {
    if (!this.lastMessage || this.isLoading) return;
    this.input.value = this.lastMessage;
    this.autoResizeInput();
    this.hideError();
    await this.sendMessage();
  }

  private async sendMessage(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.isLoading) return;

    this.lastMessage = text;
    this.input.value = "";
    this.autoResizeInput();
    this.hideEmptyState();
    this.hideError();
    this.appendTextMessage("user", text);

    const typing = this.showTyping();
    this.setLoadingState(true);

    try {
      const body: Record<string, string> = {
        sessionId: this.sessionId,
        message: text,
      };

      if (this.cartId) {
        body.cartId = this.cartId;
      }

      const response = await fetch(`${this.config.apiBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({ error: "Network error" }))) as { error?: string };
        throw new Error(errorPayload.error || "Failed to send message");
      }

      const payload = (await response.json()) as ChatResponse;
      if (payload.cartId) {
        this.cartId = payload.cartId;
      }

      typing.remove();
      this.appendAssistantPayload(
        payload.message.content,
        payload.message.products,
        payload.message.comparison,
        payload.message.cartAction
      );
    } catch (error) {
      typing.remove();
      const message = error instanceof Error ? error.message : "Something went wrong";
      this.showError(message);
    } finally {
      this.setLoadingState(false);
    }
  }
}

function mountWidget(): void {
  const root = document.getElementById(ROOT_ID) || document.body.appendChild(Object.assign(document.createElement("div"), { id: ROOT_ID }));
  root.replaceChildren();
  new ORJNConciergeWidget(root);
}

mountWidget();
