export type GuidedAnswerKey = "category" | "size" | "gender" | "budget" | "style" | "brand";

export interface GuidedOption {
  label: string;
  value: string;
}

export interface GuidedStep {
  key: GuidedAnswerKey;
  title: string;
  options: GuidedOption[];
}

export type GuidedAnswers = Partial<Record<GuidedAnswerKey, string>>;

export const GUIDED_STEPS: GuidedStep[] = [
  {
    key: "category",
    title: "What are you shopping for?",
    options: [
      { label: "Lifestyle", value: "lifestyle" },
      { label: "Running", value: "running" },
      { label: "Basketball", value: "basketball" },
      { label: "Training", value: "training" },
    ],
  },
  {
    key: "size",
    title: "What size?",
    options: ["39", "40", "41", "42", "43", "44", "45", "46"].map((size) => ({ label: size, value: size })),
  },
  {
    key: "gender",
    title: "Who is it for?",
    options: [
      { label: "Men", value: "men" },
      { label: "Women", value: "women" },
      { label: "Any", value: "any" },
    ],
  },
  {
    key: "budget",
    title: "Budget?",
    options: [
      { label: "Under $150", value: "150" },
      { label: "Under $200", value: "200" },
      { label: "Under $250", value: "250" },
      { label: "Any", value: "any" },
    ],
  },
  {
    key: "style",
    title: "Color or style?",
    options: [
      { label: "Black", value: "black" },
      { label: "White", value: "white" },
      { label: "Blue", value: "blue" },
      { label: "Neutral", value: "neutral" },
      { label: "Bold", value: "bold" },
      { label: "Any", value: "any" },
    ],
  },
  {
    key: "brand",
    title: "Brand?",
    options: [
      { label: "Nike", value: "Nike" },
      { label: "Adidas", value: "Adidas" },
      { label: "New Balance", value: "New Balance" },
      { label: "Jordan", value: "Jordan" },
      { label: "Any", value: "any" },
    ],
  },
];

function include(value: string | undefined): value is string {
  return Boolean(value && value !== "any");
}

export function buildGuidedSearchPrompt(answers: GuidedAnswers): string {
  const parts = ["Show me"];

  if (include(answers.gender)) parts.push(answers.gender);
  if (include(answers.brand)) parts.push(answers.brand);
  if (include(answers.style)) parts.push(answers.style);
  if (include(answers.category)) parts.push(answers.category);

  parts.push("shoes");

  if (include(answers.size)) parts.push(`size ${answers.size}`);
  if (include(answers.budget)) parts.push(`under $${answers.budget}`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
