import type {
  CartAction,
  ChatAction,
  ChatResponse,
  PageContext,
  Product,
  ProductComparison,
  ProductInsight,
  QuickReply,
  ShopperProfileSummary,
} from "../shared/types";
import { buildGuidedSearchPrompt, GUIDED_STEPS, type GuidedAnswers } from "./guided-flow";
import { detectPageContextFromUrl, nudgeCopyForPageContext } from "./page-context";

// Window.__ORJN_CONFIG__ is declared in vite-env.d.ts — no re-declaration needed here.

type Role = "user" | "assistant";

interface WidgetConfig {
  apiBaseUrl: string;
  shopDomain?: string;
  whatsappNumber?: string;
  whatsappEnabled: boolean;
  nudgeEnabled: boolean;
  personalShopperEnabled: boolean;
  activeClosersEnabled: boolean;
}

interface ShopifyThemeProduct {
  options?: string[];
  variants?: Array<{
    id: number;
    available?: boolean;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
  }>;
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
    whatsappNumber: runtimeConfig?.whatsappNumber,
    whatsappEnabled: runtimeConfig?.whatsappEnabled !== false,
    nudgeEnabled: runtimeConfig?.nudgeEnabled !== false,
    personalShopperEnabled: runtimeConfig?.personalShopperEnabled !== false,
    activeClosersEnabled: runtimeConfig?.activeClosersEnabled !== false,
  };
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getOrCreateShopperId(): string {
  const key = "orjn_concierge_shopper_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = `shopper_${createSessionId()}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `shopper_${createSessionId()}`;
  }
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
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }

    /* ─── LAUNCHER ─────────────────────────────────────── */
    .orjn-launcher-nudge {
      width: min(280px, calc(100vw - 32px));
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 12px 12px 14px;
      border: 1px solid var(--orjn-border-strong);
      border-right: 2px solid var(--orjn-volt);
      background: var(--orjn-bg-elevated);
      color: var(--orjn-text);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
      animation: orjn-nudge-enter 260ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .orjn-launcher-nudge.hidden {
      display: none;
    }

    .orjn-nudge-main {
      flex: 1;
      min-width: 0;
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }

    .orjn-nudge-main strong {
      display: block;
      margin-bottom: 3px;
      font-family: 'Jost', sans-serif;
      font-size: 13px;
      line-height: 1;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .orjn-nudge-main span {
      display: block;
      color: var(--orjn-text-muted);
      font-size: 11px;
      line-height: 1.35;
    }

    .orjn-nudge-main:hover strong,
    .orjn-nudge-main:focus-visible strong {
      color: var(--orjn-volt);
      outline: none;
    }

    .orjn-nudge-close {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border: 1px solid var(--orjn-border);
      background: transparent;
      color: var(--orjn-text-muted);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
    }

    .orjn-nudge-close:hover,
    .orjn-nudge-close:focus-visible {
      color: var(--orjn-text);
      border-color: var(--orjn-border-strong);
      outline: none;
    }

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

    .orjn-memory {
      display: none;
      flex-wrap: wrap;
      gap: 5px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--orjn-border);
      background: #101010;
      flex-shrink: 0;
    }

    .orjn-memory.active {
      display: flex;
    }

    .orjn-memory span {
      padding: 4px 6px;
      border: 1px solid rgba(198, 255, 46, 0.26);
      color: var(--orjn-volt);
      font-family: 'Inter', monospace;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .orjn-quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }

    .orjn-quick-reply {
      padding: 8px 10px;
      border: 1px solid var(--orjn-border);
      background: transparent;
      color: var(--orjn-text);
      cursor: pointer;
      font-family: 'Inter', monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .orjn-quick-reply:hover,
    .orjn-quick-reply:focus-visible {
      border-color: var(--orjn-volt);
      color: var(--orjn-volt);
      outline: none;
    }

    .orjn-guide {
      padding: 12px;
      border: 1px solid var(--orjn-border);
      background: var(--orjn-bg-elevated);
    }

    .orjn-guide-label {
      margin-bottom: 8px;
      color: var(--orjn-text-muted);
      font-size: 8px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-family: 'Inter', monospace;
    }

    .orjn-guide-title {
      margin: 0 0 10px;
      color: var(--orjn-text);
      font-family: 'Jost', sans-serif;
      font-size: 18px;
      line-height: 1;
      text-transform: uppercase;
    }

    .orjn-guide-options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .orjn-guide-btn {
      padding: 8px 10px;
      border: 1px solid var(--orjn-border);
      background: transparent;
      color: var(--orjn-text);
      cursor: pointer;
      font-family: 'Inter', monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .orjn-guide-btn:hover,
    .orjn-guide-btn:focus-visible {
      border-color: var(--orjn-volt);
      color: var(--orjn-volt);
      outline: none;
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
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      border: 1px solid var(--orjn-border);
      overflow: hidden;
      background: var(--orjn-bg-elevated);
      transition: border-color 120ms ease;
      cursor: pointer;
    }

    .orjn-product.no-image {
      grid-template-columns: 1fr;
    }

    .orjn-product:hover,
    .orjn-product:focus-visible {
      border-color: rgba(255,255,255,0.2);
      outline: none;
    }

    .orjn-product img {
      display: block;
      width: 100%;
      height: 112px;
      object-fit: contain;
      background: #f4f4f1;
    }

    .orjn-product-info {
      min-width: 0;
      padding: 9px 10px;
      border-left: 1px solid var(--orjn-border);
    }

    .orjn-product.no-image .orjn-product-info {
      border-left: 0;
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
      margin: 0 0 7px;
      font-size: 11px;
      line-height: 1.25;
      color: var(--orjn-text);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'Jost', sans-serif;
    }

    .orjn-product-price {
      display: flex;
      gap: 8px;
      align-items: baseline;
      font-size: 13px;
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
      margin-top: 7px;
      padding-top: 7px;
      border-top: 1px solid var(--orjn-border);
      font-size: 8px;
      line-height: 1.45;
      color: var(--orjn-text-muted);
      font-family: 'Inter', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .orjn-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 7px;
    }

    .orjn-badge {
      padding: 3px 5px;
      border: 1px solid rgba(198, 255, 46, 0.35);
      color: var(--orjn-volt);
      font-size: 7px;
      line-height: 1.2;
      font-family: 'Inter', monospace;
      letter-spacing: 0.1em;
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
      grid-column: 1 / -1;
      width: 100%;
      padding: 10px 12px;
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
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 4px;
      padding: 8px 10px 10px;
    }

    .orjn-size-btn {
      padding: 7px 2px;
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

    .orjn-action-btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 13px 14px;
      border: 1px solid var(--orjn-border-strong);
      background: var(--orjn-bg-elevated);
      color: var(--orjn-text);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      text-align: center;
      text-decoration: none;
      font-family: 'Inter', monospace;
    }

    .orjn-action-btn.whatsapp {
      border-color: rgba(198, 255, 46, 0.45);
      color: var(--orjn-volt);
    }

    .orjn-action-btn:hover {
      border-color: var(--orjn-volt);
      color: var(--orjn-volt);
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
    .orjn-cart-status {
      display: none;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-top: 2px solid var(--orjn-volt);
      background: rgba(198, 255, 46, 0.08);
      color: var(--orjn-text);
      font-size: 10px;
      line-height: 1.5;
      font-family: 'Inter', monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      flex-shrink: 0;
    }

    .orjn-cart-status-text {
      color: var(--orjn-text);
    }

    .orjn-cart-link {
      flex-shrink: 0;
      color: var(--orjn-volt);
      text-decoration: none;
      font-size: 8px;
      letter-spacing: 0.18em;
      font-weight: 700;
    }

    .orjn-cart-link:hover {
      color: #d4ff50;
    }

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

    @keyframes orjn-nudge-enter {
      from { opacity: 0; transform: translateY(8px); }
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

      .orjn-launcher-nudge {
        position: fixed;
        right: 14px;
        bottom: 86px;
        width: min(280px, calc(100vw - 28px));
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

      .orjn-product {
        grid-template-columns: 104px minmax(0, 1fr);
      }

      .orjn-product img {
        height: 104px;
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
  { label: "NEW ARRIVALS", query: "Show me new arrivals" },
  { label: "AIR FORCE 1", query: "Show me Air Force 1 options" },
  { label: "SIZE 44", query: "Show me shoes in size 44" },
  { label: "SHIPPING", query: "What is your shipping policy?" },
];

class ORJNConciergeWidget {
  private readonly config = getConfig();
  private readonly sessionId = createSessionId();
  private readonly shopperId = getOrCreateShopperId();
  private readonly pageContext: PageContext = detectPageContextFromUrl(window.location.href);

  private cartId: string | null = null;
  private cartHasItems = false;
  private readonly clickedHandles = new Set<string>();
  private readonly viewedHandles = new Set<string>();
  private lastMessage = "";
  private lastSubmittedText = "";
  private lastSubmittedAt = 0;
  private isLoading = false;
  private hasLoggedOpen = false;
  private guidedAnswers: GuidedAnswers = {};
  private guidedStepIndex = 0;
  private guidedEl: HTMLDivElement | null = null;

  private readonly shell: HTMLDivElement;
  private readonly launcherNudge: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly memoryStrip: HTMLDivElement;
  private readonly messages: HTMLDivElement;
  private readonly emptyState: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly errorBar: HTMLDivElement;
  private readonly errorText: HTMLSpanElement;
  private readonly cartStatusBar: HTMLDivElement;
  private readonly cartStatusText: HTMLSpanElement;
  private readonly cartStatusLink: HTMLAnchorElement;

  constructor(container: HTMLElement) {
    ensureStyles();

    this.shell = document.createElement("div");
    this.shell.id = "orjn-concierge-shell";

    this.launcherNudge = document.createElement("div");
    this.launcherNudge.className = "orjn-launcher-nudge";
    if (!this.config.nudgeEnabled) this.launcherNudge.classList.add("hidden");

    const nudgeMain = createButton("", "orjn-nudge-main", () => this.openChat());
    nudgeMain.setAttribute("aria-label", "Open ORJN chat");
    const nudgeCopy = nudgeCopyForPageContext(this.pageContext);
    const nudgeTitle = document.createElement("strong");
    nudgeTitle.textContent = nudgeCopy.title;
    const nudgeText = document.createElement("span");
    nudgeText.textContent = nudgeCopy.text;
    nudgeMain.append(nudgeTitle, nudgeText);

    const nudgeClose = createButton("x", "orjn-nudge-close", () => this.hideLauncherNudge());
    nudgeClose.setAttribute("aria-label", "Hide ORJN chat tip");
    this.launcherNudge.append(nudgeMain, nudgeClose);

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
    eyebrow.textContent = "ORJN CHAT";

    const title = document.createElement("h2");
    title.textContent = "Shop faster";

    const statusLine = document.createElement("div");
    statusLine.className = "orjn-header-status";
    const dot = document.createElement("span");
    dot.className = "orjn-status-dot";
    statusLine.append(dot, "Live stock");

    headerCopy.append(eyebrow, title, statusLine);

    const close = createButton("", "orjn-close", () => this.closeChat());
    close.setAttribute("aria-label", "Close ORJN Concierge");
    close.appendChild(createCloseIcon());

    header.append(headerCopy, close);

    this.memoryStrip = document.createElement("div");
    this.memoryStrip.className = "orjn-memory";
    const storedBadges = this.readStoredProfileBadges();
    if (storedBadges.length > 0) {
      this.updateMemoryStrip({ badges: storedBadges, preferences: {} });
    }

    // ── Messages ──────────────────────────────────────────
    this.messages = document.createElement("div");
    this.messages.className = "orjn-messages";

    this.emptyState = document.createElement("div");
    this.emptyState.className = "orjn-empty";

    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "Find your pair.";

    const emptyBody = document.createElement("p");
    emptyBody.textContent = "Tell me the pair, size, color, or budget.";

    const chips = document.createElement("div");
    chips.className = "orjn-chips";
    const guideChip = createButton("FIND MY PAIR", "orjn-chip", () => this.startGuidedFlow());
    chips.appendChild(guideChip);
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

    this.cartStatusBar = document.createElement("div");
    this.cartStatusBar.className = "orjn-cart-status";
    this.cartStatusText = document.createElement("span");
    this.cartStatusText.className = "orjn-cart-status-text";
    this.cartStatusLink = document.createElement("a");
    this.cartStatusLink.className = "orjn-cart-link";
    this.cartStatusLink.href = this.getStoreCartUrl();
    this.cartStatusLink.textContent = "VIEW CART →";
    this.cartStatusLink.addEventListener("click", () => {
      void this.logAnalytics("checkout_started", {
        cartHasItems: this.cartHasItems,
        pageContext: this.pageContext,
      });
    });
    this.cartStatusBar.append(this.cartStatusText, this.cartStatusLink);

    // ── Input Area ────────────────────────────────────────
    const inputArea = document.createElement("div");
    inputArea.className = "orjn-input-area";

    this.input = document.createElement("textarea");
    this.input.className = "orjn-input";
    this.input.rows = 1;
    this.input.placeholder = "Ask for a shoe, size, color...";
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
    this.panel.append(header, this.memoryStrip, this.messages, this.errorBar, this.cartStatusBar, inputArea);
    this.shell.append(this.launcherNudge, this.launcher, this.panel);
    container.appendChild(this.shell);

    this.setupViewportHandler();
  }

  private readStoredProfileBadges(): string[] {
    if (!this.config.personalShopperEnabled) return [];
    try {
      const raw = window.localStorage.getItem("orjn_concierge_profile_badges");
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, 4)
        : [];
    } catch {
      return [];
    }
  }

  private updateMemoryStrip(profile: ShopperProfileSummary | undefined): void {
    if (!this.config.personalShopperEnabled || !profile?.badges.length) return;
    this.memoryStrip.replaceChildren();
    profile.badges.slice(0, 4).forEach((badge) => {
      const item = document.createElement("span");
      item.textContent = badge;
      this.memoryStrip.appendChild(item);
    });
    this.memoryStrip.classList.add("active");
    try {
      window.localStorage.setItem("orjn_concierge_profile_badges", JSON.stringify(profile.badges.slice(0, 4)));
    } catch {
      // Local storage is optional.
    }
  }

  private buildClientSignals(): {
    clickedHandles: string[];
    viewedHandles: string[];
    cartHasItems: boolean;
  } {
    return {
      clickedHandles: Array.from(this.clickedHandles).slice(-20),
      viewedHandles: Array.from(this.viewedHandles).slice(-20),
      cartHasItems: this.cartHasItems,
    };
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
      const meaningfulOptions = variant.selectedOptions.filter(
        (option) => option.value && option.value.toLowerCase() !== "default title"
      );
      const label = meaningfulOptions.length > 1
        ? meaningfulOptions.map((option) => option.value).join(" / ")
        : sizeOpt?.value ?? variant.title;
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

  private async addToCartDirect(
    product: Product,
    variantId: string,
    sizeLabel: string,
    btn: HTMLButtonElement
  ): Promise<void> {
    btn.classList.add("adding");
    btn.disabled = true;

    try {
      await this.addToThemeCart(variantId);
      await this.syncBackendCart(product, variantId, sizeLabel);
      this.cartHasItems = true;
      void this.logAnalytics("add_to_cart", { productHandle: product.handle, variantId, sizeLabel, cartHasItems: true });
      this.refreshThemeCartCount();
      this.hideError();
      this.showCartStatus("Added. Checkout or keep looking?");
      btn.classList.remove("adding");
      btn.disabled = false;
    } catch (error) {
      const isVariantGone = (error as any)?.code === "VARIANT_NOT_FOUND";

      if (!isVariantGone) {
        try {
          const liveVariantId = await this.findLiveVariantId(product, variantId, sizeLabel);
          if (liveVariantId && liveVariantId !== variantId) {
            await this.addToThemeCart(liveVariantId);
            await this.syncBackendCart(product, liveVariantId, sizeLabel);
            this.cartHasItems = true;
            void this.logAnalytics("add_to_cart", {
              productHandle: product.handle,
              variantId: liveVariantId,
              sizeLabel,
              cartHasItems: true,
              recoveredFromStaleVariant: true,
            });
            this.refreshThemeCartCount();
            this.hideError();
            this.showCartStatus("Added. Checkout or keep looking?");
            btn.classList.remove("adding");
            btn.disabled = false;
            return;
          }
        } catch (liveError) {
          console.error("[orjn] live variant recovery failed", {
            productHandle: product.handle,
            sizeLabel,
            variantId,
            message: liveError instanceof Error ? liveError.message : String(liveError),
          });
        }
      }

      btn.classList.remove("adding");
      btn.disabled = false;
      void this.logAnalytics("fallback_triggered", {
        productHandle: product.handle,
        variantId,
        sizeLabel,
        reason: isVariantGone ? "variant_not_found" : "cart_add_failed",
      });
      this.hideError();
      this.showCartStatus("Taking you to the product page...");
      const productUrl = this.buildProductVariantUrl(product);
      setTimeout(() => { window.location.href = productUrl; }, 700);
    }
  }

  private getStoreRoot(): string {
    const root = (window as typeof window & { Shopify?: { routes?: { root?: string } } }).Shopify?.routes?.root;
    return root && root.startsWith("/") ? root : "/";
  }

  private getStoreCartUrl(): string {
    const root = this.getStoreRoot();
    const cartPath = root.endsWith("/") ? `${root}cart` : `${root}/cart`;
    return new URL(cartPath, window.location.origin).toString();
  }

  private getStoreCartAddUrl(): string {
    const root = this.getStoreRoot();
    const addPath = root.endsWith("/") ? `${root}cart/add.js` : `${root}/cart/add.js`;
    return new URL(addPath, window.location.origin).toString();
  }

  private getStoreProductJsonUrl(handle: string): string {
    const root = this.getStoreRoot();
    const path = root.endsWith("/") ? `${root}products/${handle}.js` : `${root}/products/${handle}.js`;
    return new URL(path, window.location.origin).toString();
  }

  private async addToThemeCart(variantId: string): Promise<void> {
    const numericVariantId = Number(variantId.split("/").pop());
    if (!Number.isFinite(numericVariantId)) {
      throw new Error("Invalid variant");
    }

    const response = await fetch(this.getStoreCartAddUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        items: [{ id: numericVariantId, quantity: 1 }],
      }),
    });

    if (response.status === 404) {
      throw Object.assign(new Error("Variant not found"), { code: "VARIANT_NOT_FOUND" });
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ description: "Failed to add to cart" }))) as {
        description?: string;
        error?: string;
      };
      throw new Error(payload.description || payload.error || "Failed to add to cart");
    }
  }

  private async syncBackendCart(
    product: Product,
    variantId: string,
    sizeLabel: string
  ): Promise<void> {
    try {
      const variant = product.variants.find((entry) => entry.id === variantId);
      const response = await fetch(`${this.config.apiBaseUrl}/api/cart/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId,
          quantity: 1,
          cartId: this.cartId ?? undefined,
          variantTitle: variant?.title ?? sizeLabel,
          productTitle: product.title,
          productHandle: product.handle,
          price: variant?.price,
        }),
      });

      if (!response.ok) return;

      const payload = (await response.json()) as { cartId?: string };
      if (payload.cartId) this.cartId = payload.cartId;
    } catch {
      // The theme cart is the visible cart. Backend cart sync is best-effort.
    }
  }

  private refreshThemeCartCount(): void {
    // Re-render all cart/header sections via Shopify's Section Rendering API.
    // This is the only approach that updates both the count badge AND the
    // cart drawer contents without a full page reload.
    const sectionEls = Array.from(document.querySelectorAll<HTMLElement>("[id^='shopify-section-']"));
    const cartSectionIds = sectionEls
      .map((el) => el.id.replace("shopify-section-", ""))
      .filter((id) => /cart|header/i.test(id));

    if (cartSectionIds.length > 0) {
      fetch(`/?sections=${cartSectionIds.join(",")}`)
        .then((r) => r.json())
        .then((sections: Record<string, string>) => {
          const parser = new DOMParser();
          Object.entries(sections).forEach(([sectionId, html]) => {
            const wrapper = document.getElementById(`shopify-section-${sectionId}`);
            if (!wrapper) return;
            const newEl = parser
              .parseFromString(html, "text/html")
              .getElementById(`shopify-section-${sectionId}`);
            if (newEl) wrapper.replaceWith(newEl);
          });
        })
        .catch(() => {});
    }

    // Fallback: dispatch events that some themes listen to for cart refresh
    document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true }));
  }

  private async findLiveVariantId(
    product: Product,
    variantId: string,
    fallbackLabel: string
  ): Promise<string | null> {
    const response = await fetch(this.getStoreProductJsonUrl(product.handle), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Live product lookup failed (${response.status})`);
    }

    const payload = (await response.json()) as ShopifyThemeProduct;
    const targetVariant = product.variants.find((variant) => variant.id === variantId);
    const optionNames = payload.options ?? [];
    if (optionNames.length === 0) {
      return null;
    }

    const matchingVariant = (payload.variants ?? []).find((variant) => {
      const options = [variant.option1, variant.option2, variant.option3];
      if (!variant.available) return false;

      if (targetVariant) {
        return targetVariant.selectedOptions.every((selected) => {
          const optionIndex = optionNames.findIndex(
            (optionName) => optionName.toLowerCase() === selected.name.toLowerCase()
          );
          return optionIndex >= 0 && options[optionIndex] === selected.value;
        });
      }

      return options.includes(fallbackLabel);
    });

    return matchingVariant ? `gid://shopify/ProductVariant/${matchingVariant.id}` : null;
  }

  private buildProductVariantUrl(product: Product, variantId?: string): string {
    const numericId = variantId?.split("/").pop();
    const domain = this.config.shopDomain ?? window.location.hostname ?? "orjn.myshopify.com";
    return numericId
      ? `https://${domain}/products/${product.handle}?variant=${numericId}`
      : `https://${domain}/products/${product.handle}`;
  }

  private showCartStatus(message: string): void {
    this.cartStatusText.textContent = message;
    this.cartStatusLink.href = this.getStoreCartUrl();
    this.cartStatusBar.style.display = "flex";
  }

  private async logAnalytics(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    try {
      await fetch(`${this.config.apiBaseUrl}/api/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          name,
          shopperId: this.config.personalShopperEnabled ? this.shopperId : undefined,
          payload: { ...payload, shopDomain: this.config.shopDomain },
        }),
      });
    } catch {
      // Analytics should never interrupt the storefront experience.
    }
  }

  private hideLauncherNudge(): void {
    this.launcherNudge.classList.add("hidden");
  }

  private openChat(): void {
    this.hideLauncherNudge();
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
    this.input.disabled = isLoading;
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

  private appendTextMessage(role: Role, text: string): HTMLDivElement {
    const message = document.createElement("div");
    message.className = `orjn-msg ${role}`;
    message.textContent = text;
    this.messages.appendChild(message);
    return message;
  }

  private renderProduct(product: Product, insight?: ProductInsight): HTMLElement {
    const card = document.createElement("article");
    card.className = "orjn-product";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Open ${product.title}`);

    const openProductPage = () => {
      this.clickedHandles.add(product.handle);
      this.viewedHandles.add(product.handle);
      void this.logAnalytics("product_clicked", { productHandle: product.handle, source: "product_card" });
      if (insight) {
        void this.logAnalytics("recommendation_clicked", {
          productHandle: product.handle,
          badges: insight.badges,
          reason: insight.reason,
        });
      }
      window.open(this.buildProductVariantUrl(product), "_blank", "noopener,noreferrer");
    };

    card.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, .orjn-size-grid")) return;
      openProductPage();
    });

    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openProductPage();
    });

    if (product.images[0]) {
      const img = document.createElement("img");
      img.src = product.images[0].url;
      img.alt = product.images[0].altText || product.title;
      img.loading = "lazy";
      card.appendChild(img);
    } else {
      card.classList.add("no-image");
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

    if (insight?.badges.length) {
      const badges = document.createElement("div");
      badges.className = "orjn-badges";
      insight.badges.forEach((badge) => {
        const badgeEl = document.createElement("span");
        badgeEl.className = "orjn-badge";
        badgeEl.textContent = badge;
        badges.appendChild(badgeEl);
      });
      info.appendChild(badges);
    }

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
      this.clickedHandles.add(product.handle);
      void this.logAnalytics("product_clicked", { productHandle: product.handle });

      // Toggle size grid
      const existing = card.querySelector(".orjn-size-grid");
      if (existing) { existing.remove(); return; }

      if (sizeVariants.length === 0) {
        // Fallback: open product page
        const url = this.buildProductVariantUrl(product);
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
            void this.logAnalytics("size_selected", {
              productHandle: product.handle,
              variantId,
              sizeLabel: label,
              cartHasItems: this.cartHasItems,
            });
            void this.addToCartDirect(product, variantId, label, sizeBtn);
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

  private renderViewAllLink(viewAllUrl: string, productHandles: string[] = []): HTMLAnchorElement {
    const viewAll = document.createElement("a");
    viewAll.className = "orjn-view-all-btn";
    viewAll.href = viewAllUrl;
    viewAll.target = "_blank";
    viewAll.rel = "noopener noreferrer";
    viewAll.textContent = "VIEW MORE ON ORJN";
    viewAll.addEventListener("click", () => {
      void this.logAnalytics("view_all_clicked", {
        viewAllUrl,
        productHandles,
        pageContext: this.pageContext,
        cartHasItems: this.cartHasItems,
      });
    });
    return viewAll;
  }

  private renderQuickReplies(quickReplies: QuickReply[] | undefined): HTMLElement | null {
    if (!this.config.activeClosersEnabled || !quickReplies?.length) return null;

    const wrap = document.createElement("div");
    wrap.className = "orjn-quick-replies";
    quickReplies.slice(0, 4).forEach((reply) => {
      const button = createButton(reply.label, "orjn-quick-reply", () => {
        void this.submitText(reply.prompt);
      });
      wrap.appendChild(button);
    });
    return wrap;
  }

  private appendAssistantPayload(
    text: string,
    products?: Product[],
    productInsights?: ProductInsight[],
    comparison?: ProductComparison,
    cartAction?: CartAction,
    actions?: ChatAction[],
    viewAllUrl?: string,
    quickReplies?: QuickReply[]
  ): void {
    const msgEl = this.appendTextMessage("assistant", text);

    if (products && products.length > 0) {
      const stack = document.createElement("div");
      stack.className = "orjn-stack";
      const insightByHandle = new Map((productInsights ?? []).map((entry) => [entry.handle, entry]));
      products.slice(0, 5).forEach((p) => stack.appendChild(this.renderProduct(p, insightByHandle.get(p.handle))));

      if (viewAllUrl) {
        const viewAll = this.renderViewAllLink(viewAllUrl, products.map((product) => product.handle));
        viewAll.textContent = "VIEW MORE ON ORJN →";
        stack.appendChild(viewAll);
      }

      this.messages.appendChild(stack);
    } else if (viewAllUrl) {
      this.messages.appendChild(this.renderViewAllLink(viewAllUrl));
    }

    const quickReplyEl = this.renderQuickReplies(quickReplies);
    if (quickReplyEl) this.messages.appendChild(quickReplyEl);

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

    if (actions && actions.length > 0 && this.config.whatsappEnabled) {
      const stack = document.createElement("div");
      stack.className = "orjn-stack";
      actions.forEach((action) => {
        const link = document.createElement("a");
        link.className = `orjn-action-btn ${action.type}`;
        link.href = action.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = action.label;
        link.addEventListener("click", () => {
          void this.logAnalytics(action.type === "whatsapp" ? "whatsapp_clicked" : "fallback_triggered", {
            label: action.label,
            pageContext: this.pageContext,
            hasCart: Boolean(this.cartId),
          });
          if (this.cartId) {
            void this.logAnalytics("cart_recovery_clicked", {
              label: action.label,
              pageContext: this.pageContext,
            });
          }
        });
        stack.appendChild(link);
      });
      this.messages.appendChild(stack);
    }

    // Scroll to the top of the new assistant message, not the bottom of the product cards
    msgEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

  private startGuidedFlow(): void {
    if (this.isLoading) return;
    this.hideEmptyState();
    this.guidedAnswers = {};
    this.guidedStepIndex = 0;
    void this.logAnalytics("guided_flow_started", { pageContext: this.pageContext });
    this.renderGuidedStep();
  }

  private renderGuidedStep(): void {
    const step = GUIDED_STEPS[this.guidedStepIndex];
    if (!step) {
      const query = buildGuidedSearchPrompt(this.guidedAnswers);
      void this.logAnalytics("guided_flow_completed", {
        answers: this.guidedAnswers,
        query,
        pageContext: this.pageContext,
      });
      if (this.guidedEl) {
        this.guidedEl.remove();
        this.guidedEl = null;
      }
      void this.submitText(query);
      return;
    }

    if (!this.guidedEl) {
      this.guidedEl = document.createElement("div");
      this.guidedEl.className = "orjn-guide";
      this.messages.appendChild(this.guidedEl);
    }

    this.guidedEl.replaceChildren();
    const label = document.createElement("div");
    label.className = "orjn-guide-label";
    label.textContent = `Step ${this.guidedStepIndex + 1}/${GUIDED_STEPS.length}`;

    const title = document.createElement("h3");
    title.className = "orjn-guide-title";
    title.textContent = step.title;

    const options = document.createElement("div");
    options.className = "orjn-guide-options";
    for (const option of step.options) {
      const btn = createButton(option.label, "orjn-guide-btn", () => {
        this.guidedAnswers[step.key] = option.value;
        this.guidedStepIndex += 1;
        this.renderGuidedStep();
      });
      options.appendChild(btn);
    }

    this.guidedEl.append(label, title, options);
    this.guidedEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
    await this.submitText(text);
  }

  private async submitText(text: string): Promise<void> {
    if (!text || this.isLoading) return;

    const now = Date.now();
    if (text === this.lastSubmittedText && now - this.lastSubmittedAt < 1000) {
      return;
    }

    this.lastSubmittedText = text;
    this.lastSubmittedAt = now;
    this.setLoadingState(true);
    this.lastMessage = text;
    this.input.value = "";
    this.autoResizeInput();
    this.hideEmptyState();
    this.hideError();
    this.appendTextMessage("user", text);

    const typing = this.showTyping();

    try {
      const body = {
        sessionId: this.sessionId,
        message: text,
        pageContext: this.pageContext,
        cartId: this.cartId ?? undefined,
        whatsappNumber: this.config.whatsappEnabled ? this.config.whatsappNumber : undefined,
        shopperId: this.config.personalShopperEnabled ? this.shopperId : undefined,
        clientSignals: this.config.personalShopperEnabled ? this.buildClientSignals() : undefined,
      };

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
      this.updateMemoryStrip(payload.shopperProfile);

      typing.remove();
      this.appendAssistantPayload(
        payload.message.content,
        payload.message.products,
        payload.message.productInsights,
        payload.message.comparison,
        payload.message.cartAction,
        payload.message.actions,
        payload.message.viewAllUrl,
        payload.message.quickReplies
      );
    } catch (error) {
      typing.remove();
      const rawMessage = error instanceof Error ? error.message : "Something went wrong";
      const message = rawMessage === "Failed to fetch"
        ? "Could not reach ORJN Concierge. Check the app embed API URL, Railway domain, and CORS_ORIGIN."
        : rawMessage;
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
