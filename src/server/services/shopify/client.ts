import { env, shopifyClientSecret } from "../../config.js";
import { getInstalledStorefrontAccessToken, getStorefrontAccessToken } from "./admin.js";

const STOREFRONT_API_VERSION = "2026-04";

interface StorefrontResponse<T> {
  data: T;
  errors?: { message: string }[];
}

function getOperationName(query: string): string {
  const match = query.match(/\b(query|mutation)\s+([A-Za-z0-9_]+)/);
  return match?.[2] ?? "AnonymousOperation";
}

async function doStorefrontRequest(
  query: string,
  variables: Record<string, unknown>,
  token: string | null
): Promise<globalThis.Response> {
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Shopify-Storefront-Access-Token"] = token;

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
}

export async function storefrontQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const operationName = getOperationName(query);
  const configuredToken = await getStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);
  const storefrontToken =
    configuredToken && configuredToken !== shopifyClientSecret ? configuredToken : null;

  console.info("[shopify] storefront request", {
    operationName,
    shopDomain: env.SHOPIFY_STORE_DOMAIN,
    tokenPresent: Boolean(storefrontToken),
    variableKeys: Object.keys(variables),
  });

  let res: globalThis.Response;
  try {
    res = await doStorefrontRequest(query, variables, storefrontToken);

    if (res.status === 401 && env.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
      const installedToken = await getInstalledStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);
      if (installedToken && installedToken !== storefrontToken) {
        console.warn("[shopify] storefront 401 - retrying with installed token", {
          operationName,
          shopDomain: env.SHOPIFY_STORE_DOMAIN,
        });
        res = await doStorefrontRequest(query, variables, installedToken);
      }
    }
  } catch (error) {
    console.error("[shopify] storefront network error", {
      operationName,
      shopDomain: env.SHOPIFY_STORE_DOMAIN,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");

    if (res.status === 401) {
      console.error("[shopify] storefront 401 - token rejected", {
        operationName,
        shopDomain: env.SHOPIFY_STORE_DOMAIN,
        tokenPresent: Boolean(storefrontToken),
        guidance:
          "Use one valid SHOPIFY_STOREFRONT_ACCESS_TOKEN and do not auto-create additional public storefront tokens on request failure.",
      });
    }

    console.error("[shopify] storefront http error", {
      operationName,
      shopDomain: env.SHOPIFY_STORE_DOMAIN,
      status: res.status,
      statusText: res.statusText,
      responseBody: responseBody.slice(0, 1000),
    });
    throw new Error(`Storefront API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as StorefrontResponse<T>;

  if (json.errors?.length) {
    console.error("[shopify] storefront graphql error", {
      operationName,
      shopDomain: env.SHOPIFY_STORE_DOMAIN,
      errors: json.errors,
    });
    throw new Error(`Storefront GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  return json.data;
}
