import { describe, it, expect } from "vitest";
import { answerPolicyQuestion } from "./index.js";

describe("Knowledge Base", () => {
  it("finds shipping policy", () => {
    const result = answerPolicyQuestion("How long does shipping take?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Shipping");
    expect(result.answer).toContain("1–3 business days");
  });

  it("finds returns policy", () => {
    const result = answerPolicyQuestion("Can I return my sneakers?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Returns & Exchanges");
    expect(result.answer).toContain("7 days");
  });

  it("finds authenticity policy", () => {
    const result = answerPolicyQuestion("Are your products real?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Authenticity");
    expect(result.answer).toContain("100% authentic");
  });

  it("finds sizing info", () => {
    const result = answerPolicyQuestion("What size should I get?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Sizing");
  });

  it("finds care instructions", () => {
    const result = answerPolicyQuestion("How do I clean my sneakers?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Care Instructions");
  });

  it("finds support info", () => {
    const result = answerPolicyQuestion("How can I contact you?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Customer Support");
  });

  it("handles unknown questions gracefully", () => {
    const result = answerPolicyQuestion("What is the meaning of life?");
    expect(result.found).toBe(false);
    expect(result.answer).toContain("WhatsApp");
  });

  it("finds payment info", () => {
    const result = answerPolicyQuestion("What payment methods do you accept?");
    expect(result.found).toBe(true);
    expect(result.topic).toBe("Payment");
  });
});
