import { prisma } from "../../db/client.js";
import type { HybridSearchResult } from "../../../shared/types.js";

export async function logRetrievalEvent(params: {
  sessionId?: string | null;
  query: string;
  result: HybridSearchResult;
  toolName: string;
}): Promise<void> {
  try {
    await prisma.retrievalLog.create({
      data: {
        sessionId: params.sessionId ?? null,
        query: params.query,
        normalizedQuery: params.result.understanding.normalizedQuery,
        intent: params.result.understanding.intent,
        entities: JSON.stringify(params.result.understanding.entities),
        hardFilters: JSON.stringify(params.result.understanding.filters),
        lexicalCandidates: JSON.stringify(params.result.lexicalCandidates),
        semanticCandidates: JSON.stringify(params.result.semanticCandidates),
        finalCandidates: JSON.stringify(
          params.result.results.map((entry) => ({
            productId: entry.product.id,
            handle: entry.product.handle,
            lexicalScore: entry.lexicalScore,
            semanticScore: entry.semanticScore,
            rerankScore: entry.rerankScore,
            reasoning: entry.reasoning,
          }))
        ),
        toolName: params.toolName,
      },
    });
  } catch (error) {
    console.error("[retrieval] failed to log retrieval event", error);
  }
}
