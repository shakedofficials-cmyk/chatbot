import { prisma } from "../../db/client.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

interface SessionData {
  cartId: string | null;
  conversationHistory: MessageParam[];
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
    conversationHistory: (session.conversationLog as unknown as MessageParam[]) ?? [],
    recentProducts: (session.recentProducts as unknown as string[]) ?? [],
    preferences: (session.preferences as unknown as Record<string, unknown>) ?? {},
  };
}

export async function updateSession(
  sessionId: string,
  data: {
    cartId?: string;
    conversationHistory?: MessageParam[];
    recentProducts?: string[];
    preferences?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      ...(data.cartId !== undefined && { cartId: data.cartId }),
      ...(data.conversationHistory !== undefined && {
        conversationLog: data.conversationHistory as any,
      }),
      ...(data.recentProducts !== undefined && {
        recentProducts: data.recentProducts as any,
      }),
      ...(data.preferences !== undefined && {
        preferences: data.preferences as any,
      }),
    },
  });
}

// Keep conversation history manageable — trim to last N exchanges
export function trimHistory(history: MessageParam[], maxPairs = 20): MessageParam[] {
  if (history.length <= maxPairs * 2) return history;
  return history.slice(-maxPairs * 2);
}
