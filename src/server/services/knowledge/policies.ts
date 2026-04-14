/**
 * ORJN Knowledge Base — Store Policies
 *
 * Edit these entries to update what the chatbot tells customers about store policies.
 * No code changes needed — just update the text below.
 */

export interface PolicyEntry {
  topic: string;
  keywords: string[];
  content: string;
}

export const policies: PolicyEntry[] = [
  {
    topic: "Shipping",
    keywords: ["shipping", "delivery", "ship", "deliver", "how long", "tracking", "track"],
    content: `We ship across Lebanon. Standard delivery takes 1–3 business days depending on your location. You will receive a tracking link via WhatsApp or SMS once your order is dispatched. Shipping fees are calculated at checkout based on your delivery address.`,
  },
  {
    topic: "Returns & Exchanges",
    keywords: ["return", "exchange", "refund", "send back", "swap", "wrong size"],
    content: `We accept exchanges within 7 days of delivery, provided the item is unworn, in its original packaging, and with all tags attached. Returns for refund are handled on a case-by-case basis. To initiate an exchange, contact us via WhatsApp or Instagram DM with your order number and the item you'd like to swap.`,
  },
  {
    topic: "Authenticity",
    keywords: ["authentic", "real", "fake", "original", "legit", "genuine", "counterfeit"],
    content: `Every product sold by ORJN is 100% authentic. We source directly from authorized distributors and brand partners. We do not and will never sell replicas or counterfeit products. If you have any concerns about a specific product's authenticity, reach out and we'll provide documentation.`,
  },
  {
    topic: "Sizing",
    keywords: ["size", "sizing", "fit", "true to size", "runs big", "runs small", "size guide"],
    content: `Sizing varies by brand. Most sneakers we carry run true to size (TTS). For specific fit guidance, ask about the product you're interested in — we include fit notes where available. When in doubt, we recommend going half a size up for a more comfortable fit.`,
  },
  {
    topic: "Care Instructions",
    keywords: ["care", "clean", "wash", "maintain", "maintenance", "cleaning"],
    content: `To keep your sneakers in top condition: use a soft brush or cloth for regular cleaning, avoid machine washing unless the brand explicitly supports it, store in a cool dry place away from direct sunlight, and use shoe trees for leather pairs. For specific care guidance, ask about the product you purchased.`,
  },
  {
    topic: "Customer Support",
    keywords: ["support", "help", "contact", "reach", "whatsapp", "instagram", "phone", "email"],
    content: `You can reach us via WhatsApp or Instagram DM — those are the fastest channels. Our team typically responds within a few hours during business days. For order-related issues, have your order number ready.`,
  },
  {
    topic: "Payment",
    keywords: ["payment", "pay", "cash", "card", "cod", "cash on delivery", "credit card"],
    content: `We accept credit/debit cards through our secure checkout, as well as cash on delivery (COD) for orders within Lebanon. Payment is processed securely through Shopify's payment infrastructure.`,
  },
  {
    topic: "Store Hours & Location",
    keywords: ["store", "location", "hours", "visit", "address", "open", "close", "where"],
    content: `For our latest store hours and location details, check our Instagram page or send us a message on WhatsApp. We'll share directions and availability.`,
  },
];
