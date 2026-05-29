// ── Shared fragments ──

const PRODUCT_VARIANT_FRAGMENT = `
  fragment VariantFields on ProductVariant {
    id
    title
    availableForSale
    quantityAvailable
    price { amount currencyCode }
    compareAtPrice { amount currencyCode }
    selectedOptions { name value }
    image { url altText width height }
  }
`;

const PRODUCT_FRAGMENT = `
  ${PRODUCT_VARIANT_FRAGMENT}
  fragment ProductFields on Product {
    id
    handle
    title
    description
    vendor
    productType
    tags
    images(first: 5) {
      edges { node { url altText width height } }
    }
    options { name values }
    variants(first: 100) {
      edges { node { ...VariantFields } }
    }
    priceRange {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    fitProfile: metafield(namespace: "orjn", key: "fit_profile") { value }
    trueToSizeNote: metafield(namespace: "orjn", key: "true_to_size_note") { value }
    authenticityNote: metafield(namespace: "orjn", key: "authenticity_note") { value }
    styleTags: metafield(namespace: "orjn", key: "style_tags") { value }
    materialSummary: metafield(namespace: "orjn", key: "material_summary") { value }
    recommendedUse: metafield(namespace: "orjn", key: "recommended_use") { value }
    compareHighlights: metafield(namespace: "orjn", key: "compare_highlights") { value }
    customColor: metafield(namespace: "custom", key: "color") { value }
    lifestyleType: metafield(namespace: "custom", key: "lifestyle_type") { value }
    basketballType: metafield(namespace: "custom", key: "basketball_type") { value }
    runningType: metafield(namespace: "custom", key: "running_type") { value }
    trainingType: metafield(namespace: "custom", key: "training_type") { value }
  }
`;

// ── Queries ──

export const SEARCH_PRODUCTS = `
  ${PRODUCT_FRAGMENT}
  query SearchProducts($query: String!, $first: Int!) {
    search(query: $query, first: $first, types: PRODUCT) {
      edges {
        node {
          ... on Product { ...ProductFields }
        }
      }
    }
  }
`;

export const GET_PRODUCT_BY_HANDLE = `
  ${PRODUCT_FRAGMENT}
  query GetProductByHandle($handle: String!) {
    product(handle: $handle) { ...ProductFields }
  }
`;

export const GET_PRODUCT_BY_ID = `
  ${PRODUCT_FRAGMENT}
  query GetProductById($id: ID!) {
    product(id: $id) { ...ProductFields }
  }
`;

export const GET_PRODUCTS_BY_IDS = `
  ${PRODUCT_FRAGMENT}
  query GetProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { ...ProductFields }
    }
  }
`;

// ── Sync: paginate all products ──

export const LIST_ALL_PRODUCTS = `
  ${PRODUCT_FRAGMENT}
  query ListAllProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { ...ProductFields } }
    }
  }
`;

// ── Cart mutations ──

// Creates a cart and immediately adds one line item — used by the direct size-picker flow.
export const CART_CREATE_WITH_LINE = `
  mutation CartCreateWithLine($variantId: ID!, $quantity: Int!) {
    cartCreate(input: { lines: [{ merchandiseId: $variantId, quantity: $quantity }] }) {
      cart {
        id
        checkoutUrl
        totalQuantity
        lines(first: 10) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  product { title handle }
                  image { url altText }
                  price { amount currencyCode }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
      }
      userErrors { field message }
    }
  }
`;

export const CART_CREATE = `
  mutation CartCreate {
    cartCreate {
      cart {
        id
        checkoutUrl
        totalQuantity
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  product { title handle }
                  image { url altText }
                  price { amount currencyCode }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
      }
      userErrors { field message }
    }
  }
`;

export const CART_ADD_LINES = `
  mutation CartAddLines($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        totalQuantity
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  product { title handle }
                  image { url altText }
                  price { amount currencyCode }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
      }
      userErrors { field message }
    }
  }
`;

export const CART_UPDATE_LINES = `
  mutation CartUpdateLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        id
        checkoutUrl
        totalQuantity
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  product { title handle }
                  image { url altText }
                  price { amount currencyCode }
                  selectedOptions { name value }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
      }
      userErrors { field message }
    }
  }
`;

export const CART_GET = `
  query CartGet($cartId: ID!) {
    cart(id: $cartId) {
      id
      checkoutUrl
      totalQuantity
      lines(first: 50) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                product { title handle }
                image { url altText }
                price { amount currencyCode }
                selectedOptions { name value }
              }
            }
          }
        }
      }
      cost {
        totalAmount { amount currencyCode }
        subtotalAmount { amount currencyCode }
      }
    }
  }
`;
