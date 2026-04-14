import { env } from "../../config.js";

const STOREFRONT_API_VERSION = "2025-01";

interface StorefrontResponse<T> {
  data: T;
  errors?: { message: string }[];
}

export async function storefrontQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Storefront API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as StorefrontResponse<T>;

  if (json.errors?.length) {
    throw new Error(`Storefront GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  return json.data;
}
