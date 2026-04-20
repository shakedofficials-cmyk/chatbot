import type { CartAction, ChatResponse, Product, ProductComparison } from "../shared/types";

// Window.__ORJN_CONFIG__ is declared in vite-env.d.ts — no re-declaration needed here.

type Role = "user" | "assistant";

interface WidgetConfig {
  apiBaseUrl: string;
  shopDomain?: string;
  storefrontToken?: string;
  storefrontApiVersion?: string;
}

interface StorefrontConfig {
  shopDomain: string;
  storefrontToken: string | null;
  apiVersion: string;
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
    storefrontToken: runtimeConfig?.storefrontToken,
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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Jost:wght@700;800;900&display=swap');

    :root {
      --orjn-bg: #0A0A0A;
      --orjn-bg-elevated: #141414;
      --orjn-bg-soft: #1a1a1a;
      --orjn-border: #333333;
      --orjn-border-strong: rgba(255, 255, 255, 0.22);
      --orjn-text: #FFFFFF;
      --orjn-text-muted: #888888;
      --orjn-text-subtle: #444444;
      --orjn-volt: #C6FF2E;
      --orjn-infrared: #FF5A36;
      --orjn-shadow:
        0 48px 120px rgba(0, 0, 0, 0.9),
        0 0 0 1px #1a1a1a;
    }

    #orjn-concierge-shell {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 2147483647;
      font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: var(--orjn-text);
    }

    /* ─── LAUNCHER ─────────────────────────────────────── */
    #orjn-launcher {
      width: 60px;
      height: 60px;
      display: grid;
      place-items: center;
      border: 2px solid var(--orjn-border);
      border-radius: 0;
      background: var(--orjn-bg-elevated);
      color: var(--orjn-text);
      box-shadow: var(--orjn-shadow);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
      position: relative;
      overflow: hidden;
    }

    #orjn-launcher::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--orjn-volt);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 200ms ease;
    }

    #orjn-launcher:hover,
    #orjn-launcher:focus-visible {
      border-color: var(--orjn-volt);
      outline: none;
    }

    #orjn-launcher:hover::after,
    #orjn-launcher:focus-visible::after {
      transform: scaleX(1);
    }

    /* ─── PANEL ─────────────────────────────────────────── */
    #orjn-panel {
      width: min(420px, calc(100vw - 28px));
      height: min(720px, calc(100vh - 28px));
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 2px solid var(--orjn-border);
      border-radius: 0;
      background: var(--orjn-bg);
      box-shadow: var(--orjn-shadow);
    }

    #orjn-panel.open {
      display: flex;
      animation: orjn-panel-enter 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* ─── HEADER ────────────────────────────────────────── */
    .orjn-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 16px 14px;
      border-bottom: 2px solid var(--orjn-border);
      background: var(--orjn-bg-elevated);
      flex-shrink: 0;
    }

    .orjn-header-copy p {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      font-size: 9px;
      color: var(--orjn-text-muted);
      font-family: 'Inter', monospace;
    }

    .orjn-header-copy h2 {
      margin: 5px 0 0;
      font-size: 22px;
      line-height: 1;
      font-weight: 900;
      color: var(--orjn-text);
      font-family: 'Jost', 'Helvetica Neue', sans-serif;
      text-transform: uppercase;
      letter-spacing: -0.02em;
    }

    .orjn-header-status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--orjn-volt);
      font-family: 'Inter', monospace;
    }

    .orjn-status-dot {
      width: 5px;
      height: 5px;
      background: var(--orjn-volt);
      flex-shrink: 0;
      animation: orjn-blink 2.4s ease-in-out infinite;
    }

    .orjn-close {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 1px solid var(--orjn-border);
      border-radius: 0;
      background: transparent;
      color: var(--orjn-text-muted);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
      flex-shrink: 0;
    }

    .orjn-close:hover,
    .orjn-close:focus-visible {
      background: var(--orjn-bg-soft);
      border-color: var(--orjn-border-strong);
      color: var(--orjn-text);
      outline: none;
    }

    /* ─── MESSAGES ──────────────────────────────────────── */
    .orjn-messages {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      overflow-y: auto;
      background: var(--orjn-bg);
      background-image:
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 3px,
          rgba(255,255,255,0.008) 3px,
          rgba(255,255,255,0.008) 4px
        );
    }

    .orjn-messages::-webkit-scrollbar { width: 2px; }
    .orjn-messages::-webkit-scrollbar-track { background: transparent; }
    .orjn-messages::-webkit-scrollbar-thumb { background: var(--orjn-border); }

    /* ─── EMPTY STATE ───────────────────────────────────── */
    .orjn-empty {
      margin: auto 0;
      padding: 16px 4px;
    }

    .orjn-empty strong {
      display: block;
      margin-bottom: 8px;
      color: var(--orjn-text);
      font-size: 26px;
      font-weight: 900;
      font-family: 'Jost', sans-serif;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .orjn-empty p {
      margin: 0;
      color: var(--orjn-text-muted);
      font-size: 11px;
      line-height: 1.7;
      max-width: 300px;
      font-family: 'Inter', monospace;
      letter-spacing: 0.03em;
    }

    .orjn-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 14px;
    }

    .orjn-chip {
      padding: 6px 10px;
      border: 1px solid var(--orjn-border);
      border-radius: 0;
      background: transparent;
      color: var(--orjn-text-muted);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      cursor: pointer;
      transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
      font-family: 'Inter', monospace;
    }

    .orjn-chip:hover {
      border-color: var(--orjn-volt);
      color: var(--orjn-volt);
      background: rgba(198, 255, 46, 0.04);
    }

    /* ─── MESSAGE BUBBLES ───────────────────────────────── */
    .orjn-msg {
      max-width: 88%;
      font-size: 13px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .orjn-msg.user {
      align-self: flex-end;
      padding: 10px 14px;
      background: var(--orjn-bg-elevated);
      border: 1px solid var(--orjn-border);
      border-right: 2px solid var(--orjn-volt);
      color: var(--orjn-text);
    }

    .orjn-msg.assistant {
      align-self: flex-start;
      color: var(--orjn-text);
    }

    /* ─── PRODUCT CARDS ─────────────────────────────────── */
    .orjn-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .orjn-product {
      border: 1px solid var(--orjn-border);
      overflow: hidden;
      background: var(--orjn-bg-elevated);
      transition: border-color 120ms ease;
    }

    .orjn-product:hover {
      border-color: rgba(255,255,255,0.2);
    }

    .orjn-product img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #0d0d0d;
    }

    .orjn-product-info {
      padding: 12px 14px;
      border-top: 1px solid var(--orjn-border);
    }

    .orjn-product-vendor {
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 8px;
      color: var(--orjn-text-muted);
      font-family: 'Inter', monospace;
    }

    .orjn-product-title {
      margin: 0 0 10px;
      font-size: 13px;
      line-height: 1.3;
      color: var(--orjn-text);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'Jost', sans-serif;
    }

    .orjn-product-price {
      display: flex;
      gap: 10px;
      align-items: baseline;
      font-size: 15px;
      font-weight: 800;
      font-family: 'Jost', sans-serif;
      color: var(--orjn-text);
    }

    .orjn-product-price.on-sale .current {
      color: var(--orjn-infrared);
    }

    .orjn-product-price .compare {
      color: var(--orjn-text-subtle);
      text-decoration: line-through;
      font-weight: 400;
      font-size: 11px;
    }

    .orjn-meta {
      margin-top: 9px;
      padding-top: 9px;
      border-top: 1px solid var(--orjn-border);
      font-size: 9px;
      line-height: 1.5;
      color: var(--orjn-text-muted);
      font-family: 'Inter', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* ─── BUTTONS ───────────────────────────────────────── */
    .orjn-product-btn,
    .orjn-checkout-btn,
    .orjn-retry-btn,
    .orjn-send {
      border: 0;
      cursor: pointer;
      transition: background 120ms ease, opacity 120ms ease;
    }

    .orjn-product-btn {
      display: block;
      width: 100%;
      padding: 13px 14px;
      background: var(--orjn-volt);
      color: #0A0A0A;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      text-align: center;
      border-top: 1px solid var(--orjn-border);
      font-family: 'Inter', monospace;
    }

    .orjn-product-btn:hover {
      background: #d4ff50;
    }

    /* ─── SIZE PICKER GRID ──────────────────────────────────── */
    .orjn-size-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
      gap: 4px;
      padding: 10px 14px 12px;
    }

    .orjn-size-btn {
      padding: 8px 2px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-align: center;
      background: transparent;
      border: 1px solid var(--orjn-border);
      color: var(--orjn-text);
      cursor: pointer;
      font-family: 'Inter', monospace;
      transition: border-color 80ms ease, color 80ms ease, background 80ms ease;
    }

    .orjn-size-btn:hover:not(:disabled) {
      border-color: var(--orjn-volt);
      color: var(--orjn-volt);
    }

    .orjn-size-btn:disabled {
      opacity: 0.2;
      cursor: not-allowed;
      text-decoration: line-through;
    }

    .orjn-size-btn.adding {
      background: var(--orjn-volt);
      color: #0A0A0A;
      border-color: var(--orjn-volt);
      cursor: wait;
    }

    /* ─── VIEW ALL BUTTON ───────────────────────────────────── */
    .orjn-view-all-btn {
      display: block;
      width: 100%;
      padding: 12px 14px;
      border: 1px dashed var(--orjn-border);
      background: transparent;
      color: var(--orjn-text-muted);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-align: center;
      text-decoration: none;
      font-family: 'Inter', monospace;
      text-transform: uppercase;
      transition: border-color 120ms ease, color 120ms ease;
      box-sizing: border-box;
    }

    .orjn-view-all-btn:hover {
      border-color: rgba(255,255,255,0.3);
      color: var(--orjn-text);
    }

    .orjn-checkout-btn {
      display: block;
      width: 100%;
      padding: 16px 14px;
      background: var(--orjn-volt);
      color: #0A0A0A;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      text-align: center;
      text-decoration: none;
      margin-top: 8px;
      font-family: 'Inter', monospace;
    }

    .orjn-checkout-btn:hover {
      background: #d4ff50;
    }

    /* ─── COMPARISON TABLE ──────────────────────────────── */
    .orjn-comparison {
      overflow: hidden;
      border: 1px solid var(--orjn-border);
      background: var(--orjn-bg-elevated);
    }

    .orjn-comparison-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      font-family: 'Inter', monospace;
    }

    .orjn-comparison-table th,
    .orjn-comparison-table td {
      padding: 9px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--orjn-border);
    }

    .orjn-comparison-table th {
      color: var(--orjn-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 8px;
      font-weight: 700;
      background: var(--orjn-bg);
    }

    .orjn-comparison-table td {
      color: var(--orjn-text-muted);
      line-height: 1.55;
    }

    .orjn-comparison-table td:first-child {
      color: var(--orjn-text);
      width: 76px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 9px;
    }

    .orjn-comparison-note {
      padding: 12px;
      color: var(--orjn-text-muted);
      font-size: 11px;
      line-height: 1.65;
      border-top: 1px solid var(--orjn-border);
      font-family: 'Inter', monospace;
    }

    /* ─── TYPING INDICATOR ──────────────────────────────── */
    .orjn-typing {
      display: flex;
      gap: 5px;
      padding: 8px 2px;
      align-items: center;
    }

    .orjn-typing span {
      width: 4px;
      height: 4px;
      border-radius: 0;
      background: var(--orjn-volt);
      animation: orjn-pulse 1.2s ease-in-out infinite;
    }

    .orjn-typing span:nth-child(2) { animation-delay: 160ms; }
    .orjn-typing span:nth-child(3) { animation-delay: 320ms; }

    /* ─── ERROR BAR ─────────────────────────────────────── */
    .orjn-error {
      display: none;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-top: 2px solid var(--orjn-infrared);
      background: rgba(255, 90, 54, 0.07);
      color: var(--orjn-infrared);
      font-size: 10px;
      line-height: 1.5;
      font-family: 'Inter', monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      flex-shrink: 0;
    }

    .orjn-retry-btn {
      flex-shrink: 0;
      padding: 7px 12px;
      border: 1px solid var(--orjn-infrared);
      background: transparent;
      color: var(--orjn-infrared);
      font-size: 8px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-family: 'Inter', monospace;
      transition: background 120ms ease;
    }

    .orjn-retry-btn:hover {
      background: rgba(255, 90, 54, 0.1);
    }

    /* ─── INPUT AREA ────────────────────────────────────── */
    .orjn-input-area {
      display: flex;
      align-items: stretch;
      border-top: 2px solid var(--orjn-border);
      background: var(--orjn-bg-elevated);
      flex-shrink: 0;
    }

    .orjn-input {
      flex: 1;
      min-height: 52px;
      max-height: 140px;
      resize: none;
      border: none;
      border-right: 2px solid var(--orjn-border);
      padding: 15px 16px;
      background: transparent;
      color: var(--orjn-text);
      font-family: 'Inter', monospace;
      font-size: 12px;
      line-height: 1.6;
      letter-spacing: 0.02em;
    }

    .orjn-input::placeholder {
      color: var(--orjn-text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 9px;
    }

    .orjn-input:focus {
      outline: none;
      background: rgba(198, 255, 46, 0.012);
    }

    .orjn-send {
      width: 56px;
      display: grid;
      place-items: center;
      background: var(--orjn-volt);
      color: #0A0A0A;
      flex-shrink: 0;
    }

    .orjn-send:hover:not([disabled]) {
      background: #d4ff50;
    }

    .orjn-send[disabled] {
      opacity: 0.3;
      cursor: not-allowed;
      background: var(--orjn-border);
      color: var(--orjn-text-subtle);
    }

    /* ─── ANIMATIONS ────────────────────────────────────── */
    @keyframes orjn-pulse {
      0%, 80%, 100% { opacity: 0.15; transform: scale(0.7); }
      40% { opacity: 1; transform: scale(1.3); }
    }

    @keyframes orjn-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }

    @keyframes orjn-panel-enter {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ─── RESPONSIVE ────────────────────────────────────── */
    @media (max-width: 640px) {
      #orjn-concierge-shell { right: 12px; bottom: 12px; }
      #orjn-panel.open {
        width: calc(100vw - 24px);
        height: min(82vh, 720px);
      }
    }

    @media (max-width: 480px) {
      #orjn-concierge-shell { right: 0; bottom: 0; }

      #orjn-launcher {
        position: fixed;
        right: 14px;
        bottom: 14px;
      }

      #orjn-panel.open {
        width: 100vw;
        height: 100dvh;
        border-left: 0;
        border-right: 0;
        border-bottom: 0;
      }

      .orjn-input-area {
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
    }
  `;

  document.head.appendChild(style);
}

function createButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// Sharp terminal-style chat icon (zero border-radius SVG path)
function createLauncherIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "square");
  svg.setAttribute("stroke-linejoin", "miter");

  // Sharp message box — no arcs, no radius
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 3 L21 3 L21 17 L7 17 L3 21 L3 3 Z");
  svg.appendChild(path);
  return svg;
}

function createCloseIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "square");

  const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  l1.setAttribute("x1", "1"); l1.setAttribute("y1", "1");
  l1.setAttribute("x2", "11"); l1.setAttribute("y2", "11");

  const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  l2.setAttribute("x1", "11"); l2.setAttribute("y1", "1");
  l2.setAttribute("x2", "1"); l2.setAttribute("y2", "11");

  svg.append(l1, l2);
  return svg;
}

function createSendIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "square");
  svg.setAttribute("stroke-linejoin", "miter");

  const shaft = document.createElementNS("http://www.w3.org/2000/svg", "line");
  shaft.setAttribute("x1", "8"); shaft.setAttribute("y1", "14");
  shaft.setAttribute("x2", "8"); shaft.setAttribute("y2", "2");

  const left = document.createElementNS("http://www.w3.org/2000/svg", "line");
  left.setAttribute("x1", "2"); left.setAttribute("y1", "8");
  left.setAttribute("x2", "8"); left.setAttribute("y2", "2");

  const right = document.createElementNS("http://www.w3.org/2000/svg", "line");
  right.setAttribute("x1", "14"); right.setAttribute("y1", "8");
  right.setAttribute("x2", "8"); right.setAttribute("y2", "2");

  svg.append(shaft, left, right);
  return svg;
}

function renderPrice(
  price?: Product["priceRange"]["minVariantPrice"],
  compareAt?: Product["variants"][0]["compareAtPrice"] | null
): HTMLElement {
  const wrap = document.createElement("div");
  const hasSale = !!compareAt;
  wrap.className = `orjn-product-price${hasSale ? " on-sale" : ""}`;

  const current = document.createElement("span");
  current.className = "current";
  current.textContent = price ? `${price.amount} ${price.currencyCode}` : "";
  wrap.appendChild(current);

  if (compareAt) {
    const compare = document.createElement("span");
    compare.className = "compare";
    compare.textContent = `${compareAt.amount} ${compareAt.currencyCode}`;
    wrap.appendChild(compare);
  }

  return wrap;
}

const QUICK_QUERIES = [
  { label: "LATEST DROPS", query: "What are the latest drops?" },
  { label: "AIR FORCE 1", query: "Show me Air Force 1 options" },
  { label: "JORDAN 1", query: "Show me Jordan 1 options" },
  { label: "SHIPPING INFO", query: "What are your shipping policies?" },
];

class ORJNConciergeWidget {
  private readonly config = getConfig();
  private readonly sessionId = createSessionId();

  private cartId: string | null = null;
  private lastMessage = "";
  private isLoading = false;
  private hasLoggedOpen = false;
  private storefrontConfig: StorefrontConfig | null = null;

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

    // ── Launcher ──────────────────────────────────────────
    this.launcher = createButton("", "", () => this.openChat());
    this.launcher.id = "orjn-launcher";
    this.launcher.setAttribute("aria-label", "Open ORJN Concierge");
    this.launcher.appendChild(createLauncherIcon());

    // ── Panel ─────────────────────────────────────────────
    this.panel = document.createElement("div");
    this.panel.id = "orjn-panel";

    // ── Header ────────────────────────────────────────────
    const header = document.createElement("div");
    header.className = "orjn-header";

    const headerCopy = document.createElement("div");
    headerCopy.className = "orjn-header-copy";

    const eyebrow = document.createElement("p");
    eyebrow.textContent = "SYS.DIR // CONCIERGE";

    const title = document.createElement("h2");
    title.textContent = "Drop Intelligence";

    const statusLine = document.createElement("div");
    statusLine.className = "orjn-header-status";
    const dot = document.createElement("span");
    dot.className = "orjn-status-dot";
    statusLine.append(dot, "Network Live");

    headerCopy.append(eyebrow, title, statusLine);

    const close = createButton("", "orjn-close", () => this.closeChat());
    close.setAttribute("aria-label", "Close ORJN Concierge");
    close.appendChild(createCloseIcon());

    header.append(headerCopy, close);

    // ── Messages ──────────────────────────────────────────
    this.messages = document.createElement("div");
    this.messages.className = "orjn-messages";

    this.emptyState = document.createElement("div");
    this.emptyState.className = "orjn-empty";

    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "Query the network.";

    const emptyBody = document.createElement("p");
    emptyBody.textContent =
      "Drop intel, size availability, archive pricing, sourcing. Ask anything — we pull live catalog data, not guesses.";

    const chips = document.createElement("div");
    chips.className = "orjn-chips";
    QUICK_QUERIES.forEach(({ label, query }) => {
      const chip = createButton(label, "orjn-chip", () => {
        this.input.value = query;
        this.autoResizeInput();
        void this.sendMessage();
      });
      chips.appendChild(chip);
    });

    this.emptyState.append(emptyTitle, emptyBody, chips);
    this.messages.appendChild(this.emptyState);

    // ── Error Bar ─────────────────────────────────────────
    this.errorBar = document.createElement("div");
    this.errorBar.className = "orjn-error";
    this.errorText = document.createElement("span");
    const retry = createButton("RETRY", "orjn-retry-btn", () => this.retryLast());
    this.errorBar.append(this.errorText, retry);

    // ── Input Area ────────────────────────────────────────
    const inputArea = document.createElement("div");
    inputArea.className = "orjn-input-area";

    this.input = document.createElement("textarea");
    this.input.className = "orjn-input";
    this.input.rows = 1;
    this.input.placeholder = "QUERY THE NETWORK...";
    this.input.addEventListener("input", () => this.autoResizeInput());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });

    this.sendButton = createButton("", "orjn-send", () => {
      void this.sendMessage();
    });
    this.sendButton.setAttribute("aria-label", "Send message");
    this.sendButton.appendChild(createSendIcon());

    inputArea.append(this.input, this.sendButton);
    this.panel.append(header, this.messages, this.errorBar, inputArea);
    this.shell.append(this.launcher, this.panel);
    container.appendChild(this.shell);

    this.setupViewportHandler();
    void this.loadStorefrontConfig();
  }

  private async loadStorefrontConfig(): Promise<void> {
    // If shopDomain + token already supplied via __ORJN_CONFIG__, use them.
    if (this.config.shopDomain && this.config.storefrontToken !== undefined) {
      this.storefrontConfig = {
        shopDomain: this.config.shopDomain,
        storefrontToken: this.config.storefrontToken ?? null,
        apiVersion: "2024-01",
      };
      return;
    }
    try {
      const res = await fetch(`${this.config.apiBaseUrl}/api/widget-config`);
      if (res.ok) {
        this.storefrontConfig = (await res.json()) as StorefrontConfig;
      }
    } catch {
      // Non-fatal — cart will fall back to product page URL
    }
  }

  private setupViewportHandler(): void {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handler = () => {
      if (!this.panel.classList.contains("open")) return;
      if (window.innerWidth > 480) return;
      const keyboardOffset = window.innerHeight - vv.height - vv.offsetTop;
      this.panel.style.height = `${vv.height}px`;
      this.panel.style.bottom = `${keyboardOffset}px`;
    };
    const resetHandler = () => {
      if (window.innerWidth > 480) return;
      this.panel.style.height = "";
      this.panel.style.bottom = "";
    };
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    this.input.addEventListener("blur", resetHandler);
  }

  private autoResizeInput(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`;
  }

  private getProductSizeVariants(product: Product): Array<{ label: string; variantId: string; available: boolean }> {
    const seen = new Set<string>();
    const result: Array<{ label: string; variantId: string; available: boolean }> = [];
    for (const variant of product.variants) {
      const sizeOpt = variant.selectedOptions.find((o) => o.name.toLowerCase() === "size");
      const label = sizeOpt?.value ?? variant.title;
      if (seen.has(label)) {
        // Keep the first available if duplicate
        const existing = result.find((r) => r.label === label);
        if (existing && !existing.available && variant.availableForSale) {
          existing.variantId = variant.id;
          existing.available = true;
        }
        continue;
      }
      seen.add(label);
      result.push({ label, variantId: variant.id, available: variant.availableForSale });
    }
    return result;
  }

  private async addToCartDirect(product: Product, variantId: string, btn: HTMLButtonElement): Promise<void> {
    btn.classList.add("adding");
    btn.disabled = true;

    try {
      const checkoutUrl = await this.createShopifyCart(variantId, product);
      this.cartId = null; // local cart no longer relevant once Shopify handles it
      void this.logAnalytics("add_to_cart", { productHandle: product.handle, variantId });
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    } catch {
      btn.classList.remove("adding");
      btn.disabled = false;
      const original = btn.textContent ?? "";
      btn.textContent = "ERR — RETRY";
      setTimeout(() => {
        btn.textContent = original;
      }, 2500);
    }
  }

  // Call Shopify Storefront API directly from the browser (Storefront tokens are
  // designed to be public — Shopify explicitly supports this for headless commerce).
  // Falls back to /products/{handle}?variant={id} if the API call fails.
  private async createShopifyCart(variantId: string, product: Product): Promise<string> {
    const sf = this.storefrontConfig;
    const shopDomain = sf?.shopDomain ?? this.config.shopDomain;

    if (shopDomain) {
      const apiVersion = sf?.apiVersion ?? "2024-01";
      const endpoint = `https://${shopDomain}/api/${apiVersion}/graphql.json`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sf?.storefrontToken) {
        headers["X-Shopify-Storefront-Access-Token"] = sf.storefrontToken;
      }

      const mutation = `
        mutation CartCreate($variantId: ID!) {
          cartCreate(input: { lines: [{ merchandiseId: $variantId, quantity: 1 }] }) {
            cart { id checkoutUrl }
            userErrors { field message }
          }
        }
      `;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: mutation, variables: { variantId } }),
        });

        if (res.ok) {
          const json = (await res.json()) as {
            data?: { cartCreate?: { cart?: { id: string; checkoutUrl: string }; userErrors?: { message: string }[] } };
            errors?: { message: string }[];
          };
          const cart = json.data?.cartCreate?.cart;
          const errors = json.data?.cartCreate?.userErrors ?? json.errors ?? [];
          if (cart?.checkoutUrl && errors.length === 0) {
            return cart.checkoutUrl;
          }
        }
      } catch {
        // Network error — fall through to product page fallback
      }
    }

    // Fallback: product page with variant pre-selected
    const numericId = variantId.split("/").pop() ?? variantId;
    const domain = shopDomain ?? "orjn.myshopify.com";
    return `https://${domain}/products/${product.handle}?variant=${numericId}`;
  }

  private async logAnalytics(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    try {
      await fetch(`${this.config.apiBaseUrl}/api/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          name,
          payload: { ...payload, shopDomain: this.config.shopDomain },
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
      const img = document.createElement("img");
      img.src = product.images[0].url;
      img.alt = product.images[0].altText || product.title;
      img.loading = "lazy";
      card.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "orjn-product-info";

    const vendor = document.createElement("div");
    vendor.className = "orjn-product-vendor";
    vendor.textContent = product.vendor || "ORJN";

    const titleEl = document.createElement("h3");
    titleEl.className = "orjn-product-title";
    titleEl.textContent = product.title;

    const compareAtPrice =
      product.variants.find((v) => v.compareAtPrice)?.compareAtPrice ?? null;
    info.append(vendor, titleEl, renderPrice(product.priceRange.minVariantPrice, compareAtPrice));

    const inStockSizes = product.variants
      .filter((v) => v.availableForSale)
      .flatMap((v) =>
        v.selectedOptions
          .filter((o) => o.name.toLowerCase() === "size")
          .map((o) => o.value)
      );

    if (inStockSizes.length > 0) {
      const meta = document.createElement("div");
      meta.className = "orjn-meta";
      meta.textContent = `In Stock: ${Array.from(new Set(inStockSizes)).slice(0, 6).join(" · ")}`;
      info.appendChild(meta);
    }

    card.appendChild(info);

    const sizeVariants = this.getProductSizeVariants(product);
    const action = createButton("SECURE PAIR →", "orjn-product-btn", () => {
      void this.logAnalytics("product_clicked", { productHandle: product.handle });

      // Toggle size grid
      const existing = card.querySelector(".orjn-size-grid");
      if (existing) { existing.remove(); return; }

      if (sizeVariants.length === 0) {
        // Fallback: open product page
        const url = `https://${this.config.shopDomain ?? "orjn.myshopify.com"}/products/${product.handle}`;
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const grid = document.createElement("div");
      grid.className = "orjn-size-grid";

      for (const { label, variantId, available } of sizeVariants) {
        const sizeBtn = document.createElement("button");
        sizeBtn.type = "button";
        sizeBtn.className = "orjn-size-btn";
        sizeBtn.textContent = label;
        sizeBtn.disabled = !available;
        if (available) {
          sizeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.addToCartDirect(product, variantId, sizeBtn);
          });
        }
        grid.appendChild(sizeBtn);
      }

      card.insertBefore(grid, action);
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
    comparison.products.forEach((p) => {
      const th = document.createElement("th");
      th.textContent = p.title;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    const availableSizes = new Map(
      comparison.comparison.availableSizes.map((e) => [e.handle, e.sizes.join(" · ") || "—"])
    );
    const brands = new Map(comparison.comparison.brands.map((e) => [e.handle, e.brand || "—"]));
    const prices = new Map(comparison.comparison.prices.map((e) => [e.handle, e.price || "—"]));
    const productTypes = new Map(comparison.comparison.productTypes.map((e) => [e.handle, e.type || "—"]));
    const materials = new Map(comparison.comparison.materials.map((e) => [e.handle, e.material || "—"]));

    const rows: Array<{ label: string; lookup: (handle: string) => string }> = [
      { label: "Brand",    lookup: (h) => brands.get(h) || "—" },
      { label: "Price",    lookup: (h) => prices.get(h) || "—" },
      { label: "Sizes",    lookup: (h) => availableSizes.get(h) || "—" },
      { label: "Type",     lookup: (h) => productTypes.get(h) || "—" },
      { label: "Material", lookup: (h) => materials.get(h) || "—" },
    ];

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = row.label;
      tr.appendChild(labelCell);
      comparison.products.forEach((p) => {
        const valueCell = document.createElement("td");
        valueCell.textContent = row.lookup(p.handle);
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
    cartAction?: CartAction,
    viewAllUrl?: string
  ): void {
    this.appendTextMessage("assistant", text);

    if (products && products.length > 0) {
      const stack = document.createElement("div");
      stack.className = "orjn-stack";
      products.slice(0, 5).forEach((p) => stack.appendChild(this.renderProduct(p)));

      if (viewAllUrl) {
        const viewAll = document.createElement("a");
        viewAll.className = "orjn-view-all-btn";
        viewAll.href = viewAllUrl;
        viewAll.target = "_blank";
        viewAll.rel = "noopener noreferrer";
        viewAll.textContent = "VIEW MORE ON ORJN →";
        stack.appendChild(viewAll);
      }

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
      link.textContent = "SECURE CHECKOUT →";
      this.messages.appendChild(link);
    }

    this.scrollToBottom();
  }

  private showTyping(): HTMLDivElement {
    const typing = document.createElement("div");
    typing.className = "orjn-typing";
    typing.append(
      document.createElement("span"),
      document.createElement("span"),
      document.createElement("span")
    );
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

      if (this.cartId) body.cartId = this.cartId;

      const response = await fetch(`${this.config.apiBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({ error: "Network error" }))) as {
          error?: string;
        };
        throw new Error(errorPayload.error || "Failed to send message");
      }

      const payload = (await response.json()) as ChatResponse;
      if (payload.cartId) this.cartId = payload.cartId;

      typing.remove();
      this.appendAssistantPayload(
        payload.message.content,
        payload.message.products,
        payload.message.comparison,
        payload.message.cartAction,
        payload.message.viewAllUrl
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
  const root =
    document.getElementById(ROOT_ID) ||
    document.body.appendChild(
      Object.assign(document.createElement("div"), { id: ROOT_ID })
    );
  root.replaceChildren();
  new ORJNConciergeWidget(root);
}

mountWidget();
