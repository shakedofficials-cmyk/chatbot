import { env } from "../../config.js";

const STOREFRONT_API_VERSION = "2025-01";

interface StorefrontResponse<T> {
  data: T;
  errors?: { message: string }[];
}

function getOperationName(query: string): string {
  const match = query.match(/\b(query|mutation)\s+([A-Za-z0-9_]+)/);
  return match?.[2] ?? "AnonymousOperation";
}

export async function storefrontQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const operationName = getOperationName(query);
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;

  console.info("[shopify] storefront request", {
    operationName,
    shopDomain: env.SHOPIFY_STORE_DOMAIN,
    tokenPresent: Boolean(env.SHOPIFY_STOREFRONT_ACCESS_TOKEN),
    variableKeys: Object.keys(variables),
  });

  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
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
