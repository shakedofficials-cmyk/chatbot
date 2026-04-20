import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { addVariantToCart } from "../services/shopify/direct-cart.js";

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

  const result = await addVariantToCart({
    variantId: parsed.data.variantId,
    cartId: parsed.data.cartId,
    variantTitle: parsed.data.variantTitle,
    productTitle: parsed.data.productTitle,
    productHandle: parsed.data.productHandle,
    price: parsed.data.price,
  });

  res.json({
    cartId: result.cart.id,
    checkoutUrl: result.cart.checkoutUrl,
    provider: result.provider,
    reusedExistingCart: result.reusedExistingCart,
  });
});

export default router;
