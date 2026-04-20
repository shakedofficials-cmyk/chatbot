import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { cartCreateWithLine } from "../services/shopify/storefront.js";
import { localCartCreate, localCartAddLines } from "../services/shopify/local-cart.js";
import { hasLiveShopifyStore } from "../config.js";

const router = Router();

const addSchema = z.object({
  variantId: z.string().min(1),
  cartId: z.string().optional(),
  variantTitle: z.string().optional(),
  productTitle: z.string().optional(),
  productHandle: z.string().optional(),
  price: z.object({ amount: z.string(), currencyCode: z.string() }).optional(),
});

router.post("/add", async (req: Request, res: Response) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { variantId, cartId, variantTitle, productTitle, productHandle, price } = parsed.data;

  // Try Shopify Storefront API first (works tokenless for cart ops).
  // Fall back to local cart (which builds a /products/ URL) if Shopify call fails.
  if (hasLiveShopifyStore) {
    try {
      const cart = await cartCreateWithLine(variantId, 1);
      res.json({ cartId: cart.id, checkoutUrl: cart.checkoutUrl });
      return;
    } catch (err) {
      console.error("[cart/add] Storefront API failed, falling back to local cart:", err);
    }
  }

  // Local-cart fallback — builds /products/{handle}?variant={id} URL
  let resolvedCartId = cartId;
  if (!resolvedCartId) {
    const newCart = localCartCreate();
    resolvedCartId = newCart.id;
  }
  const localCart = localCartAddLines(resolvedCartId, variantId, 1, {
    variantTitle,
    productTitle,
    productHandle,
    price,
  });

  res.json({ cartId: localCart.id, checkoutUrl: localCart.checkoutUrl });
});

export default router;
