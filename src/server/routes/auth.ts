import { Router, type Request, type Response } from "express";
import {
  buildInstallUrl,
  ensureShopifyOAuthConfig,
  exchangeAuthCodeForOfflineToken,
  verifyAuthState,
  verifyOAuthCallbackHmac,
} from "../services/shopify/auth.js";
import { ensureManagedStorefrontAccessToken } from "../services/shopify/admin.js";
import { assertValidShopDomain, getConfiguredShopDomain, upsertInstalledShop } from "../services/shopify/installations.js";
import { env } from "../config.js";

const router = Router();

function buildSuccessRedirect(shopDomain: string): string {
  const base = env.SHOPIFY_APP_URL.trim().replace(/\/+$/, "");
  if (!base) {
    return "/";
  }

  const url = new URL(base);
  url.searchParams.set("shopify_auth", "success");
  url.searchParams.set("shop", shopDomain);
  return url.toString();
}

router.get("/start", (req: Request, res: Response) => {
  try {
    ensureShopifyOAuthConfig();
    const shopParam =
      typeof req.query.shop === "string" && req.query.shop
        ? req.query.shop
        : getConfiguredShopDomain();

    if (!shopParam) {
      res.status(400).json({ error: "Missing shop query parameter." });
      return;
    }

    const installUrl = buildInstallUrl(shopParam);
    res.redirect(installUrl);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    ensureShopifyOAuthConfig();

    const shop = typeof req.query.shop === "string" ? req.query.shop : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const rawQuery = req.originalUrl.split("?")[1] ?? "";
    const params = new URLSearchParams(rawQuery);

    if (!shop || !code || !state) {
      res.status(400).json({ error: "Missing required Shopify OAuth callback parameters." });
      return;
    }

    const shopDomain = assertValidShopDomain(shop);
    if (!verifyOAuthCallbackHmac(params)) {
      res.status(400).json({ error: "Invalid Shopify OAuth callback signature." });
      return;
    }

    if (!verifyAuthState(state, shopDomain)) {
      res.status(400).json({ error: "Invalid or expired Shopify OAuth state." });
      return;
    }

    const token = await exchangeAuthCodeForOfflineToken(shopDomain, code);
    await upsertInstalledShop({
      shopDomain,
      adminAccessToken: token.accessToken,
      adminAccessTokenExpiresAt: token.accessTokenExpiresAt,
      adminRefreshToken: token.refreshToken,
      adminRefreshTokenExpiresAt: token.refreshTokenExpiresAt,
      adminScopes: token.scopes,
      lastAdminRefreshAt: new Date(),
    });

    try {
      await ensureManagedStorefrontAccessToken(shopDomain);
    } catch (error) {
      console.error("[shopify] storefront token creation failed after install", {
        shopDomain,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    res.redirect(buildSuccessRedirect(shopDomain));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
