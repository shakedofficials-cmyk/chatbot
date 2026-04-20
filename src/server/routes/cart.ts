import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { localCartCreate, localCartAddLines } from "../services/shopify/local-cart.js";

const router = Router();

const addSchema = z.object({
  variantId: z.string().min(1),
  cartId: z.string().optional(),
  variantTitle: z.string().optional(),
  productTitle: z.string().optional(),
  productHandle: z.string().optional(),
  price: z.object({ amount: z.string(), currencyCode: z.string() }).optional(),
});

router.post("/add", (req: Request, res: Response) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { variantId, cartId, variantTitle, productTitle, productHandle, price } = parsed.data;

  let resolvedCartId = cartId;
  if (!resolvedCartId) {
    const newCart = localCartCreate();
    resolvedCartId = newCart.id;
  }

  const cart = localCartAddLines(resolvedCartId, variantId, 1, {
    variantTitle,
    productTitle,
    productHandle,
    price,
  });

  res.json({ cartId: cart.id, checkoutUrl: cart.checkoutUrl });
});

export default router;
