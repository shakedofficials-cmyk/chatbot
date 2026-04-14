import { prisma } from "../../db/client.js";
import type { AnalyticsEventName } from "../../../shared/types.js";

export async function logEvent(
  sessionId: string,
  name: AnalyticsEventName | string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    // Ensure session exists
    await prisma.chatSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId },
      update: {},
    });

    await prisma.analyticsEvent.create({
      data: {
        name,
        sessionId,
        payload: payload as any,
      },
    });
  } catch (err) {
    // Log but don't throw — analytics should never break the user flow
    console.error("Analytics logging error:", err);
  }
}
