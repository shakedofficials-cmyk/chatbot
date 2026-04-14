import type { ChatResponse, AnalyticsEventName } from "../shared/types";

// Use Shopify embed config if available, otherwise fall back to Vite env
const API_URL = window.__ORJN_CONFIG__?.apiUrl || import.meta.env.VITE_API_URL || "";

export async function sendMessage(
  sessionId: string,
  message: string,
  cartId?: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, cartId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error(err.error || "Failed to send message");
  }

  return res.json();
}

export async function trackEvent(
  sessionId: string,
  name: AnalyticsEventName,
  payload?: Record<string, unknown>
): Promise<void> {
  fetch(`${API_URL}/api/analytics/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, name, payload }),
  }).catch(() => {}); // Fire and forget
}
