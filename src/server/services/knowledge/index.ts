import { policies, type PolicyEntry } from "./policies.js";

export function answerPolicyQuestion(question: string): {
  found: boolean;
  topic: string | null;
  answer: string;
} {
  const q = question.toLowerCase();

  // Score each policy by keyword match count
  const scored = policies
    .map((policy) => ({
      policy,
      score: policy.keywords.filter((kw) => q.includes(kw)).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      found: false,
      topic: null,
      answer:
        "I don't have a specific policy answer for that. You can reach us on WhatsApp or Instagram DM for help.",
    };
  }

  const best = scored[0].policy;
  return {
    found: true,
    topic: best.topic,
    answer: best.content,
  };
}

export function getAllPolicies(): PolicyEntry[] {
  return policies;
}
