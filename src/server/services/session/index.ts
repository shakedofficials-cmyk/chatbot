import { prisma } from "../../db/client.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value); } catch { return fallback; }
}

interface SessionData {
  cartId: string | null;
  conversationHistory: ConversationMessage[];
  recentProducts: string[];
  preferences: Record<string, unknown>;
}

export async function getOrCreateSession(sessionId: string): Promise<SessionData> {
  const session = await prisma.chatSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId },
    update: {},
  });

  return {
    cartId: session.cartId,
    conversationHistory: parseJson<ConversationMessage[]>(session.conversationLog, []),
    recentProducts: parseJson<string[]>(session.recentProducts, []),
    preferences: parseJson<Record<string, unknown>>(session.preferences, {}),
  };
}

export async function updateSession(
  sessionId: string,
  data: {
    cartId?: string;
    conversationHistory?: ConversationMessage[];
    recentProducts?: string[];
    preferences?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      ...(data.cartId !== undefined && { cartId: data.cartId }),
      ...(data.conversationHistory !== undefined && {
        conversationLog: JSON.stringify(data.conversationHistory),
      }),
      ...(data.recentProducts !== undefined && {
        recentProducts: JSON.stringify(data.recentProducts),
      }),
      ...(data.preferences !== undefined && {
        preferences: JSON.stringify(data.preferences),
      }),
    },
  });
}

// Keep conversation history manageable — trim to last N exchanges
export function trimHistory(history: ConversationMessage[], maxPairs = 20): ConversationMessage[] {
  if (history.length <= maxPairs * 2) return history;
  return history.slice(-maxPairs * 2);
}
