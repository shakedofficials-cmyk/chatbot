import OpenAI from "openai";
import { prisma } from "../../db/client.js";
import { env } from "../../config.js";
import { hashText } from "./normalize.js";

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function embedText(text: string): Promise<number[] | null> {
  if (!openai || !text.trim()) return null;

  const response = await openai.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0]?.embedding ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function upsertProductEmbeddingIfNeeded(
  productId: string,
  embeddingText: string
): Promise<void> {
  if (!openai || !embeddingText.trim()) return;

  const contentHash = hashText(embeddingText);
  const existing = await prisma.catalogEmbedding.findUnique({
    where: {
      productId_model: {
        productId,
        model: env.OPENAI_EMBEDDING_MODEL,
      },
    },
  });

  if (existing?.contentHash === contentHash) {
    return;
  }

  const vector = await embedText(embeddingText);
  if (!vector) return;

  await prisma.catalogEmbedding.upsert({
    where: {
      productId_model: {
        productId,
        model: env.OPENAI_EMBEDDING_MODEL,
      },
    },
    update: {
      vector: JSON.stringify(vector),
      dimensions: vector.length,
      embeddingText,
      contentHash,
    },
    create: {
      productId,
      model: env.OPENAI_EMBEDDING_MODEL,
      vector: JSON.stringify(vector),
      dimensions: vector.length,
      embeddingText,
      contentHash,
    },
  });
}
