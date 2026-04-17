import { env } from "../../config.js";
import { getStorefrontAccessToken, ensureManagedStorefrontAccessToken } from "./admin.js";

const STOREFRONT_API_VERSION = "2024-01";

interface StorefrontResponse<T> {
  data: T;
  errors?: { message: string }[];
}

function getOperationName(query: string): string {
  const match = query.match(/\b(query|mutation)\s+([A-Za-z0-9_]+)/);
  return match?.[2] ?? "AnonymousOperation";
}

async function doStorefrontRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string | null
): Promise<{ res: globalThis.Response; ok: boolean }> {
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Shopify-Storefront-Access-Token"] = token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return { res, ok: res.ok };
}

export async function storefrontQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const operationName = getOperationName(query);
  let storefrontToken = await getStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);

  console.info("[shopify] storefront request", {
    operationName,
    shopDomain: env.SHOPIFY_STORE_DOMAIN,
    tokenPresent: Boolean(storefrontToken),
    variableKeys: Object.keys(variables),
  });

  let res: globalThis.Response;
  try {
    const attempt = await doStorefrontRequest<T>(query, variables, storefrontToken);
    res = attempt.res;

    // On 401, try to refresh the token via client_credentials and retry once
    if (res.status === 401) {
      console.warn("[shopify] storefront 401 — attempting token refresh", { operationName });
      storefrontToken = await ensureManagedStorefrontAccessToken(env.SHOPIFY_STORE_DOMAIN);
      const retry = await doStorefrontRequest<T>(query, variables, storefrontToken);
      res = retry.res;
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
