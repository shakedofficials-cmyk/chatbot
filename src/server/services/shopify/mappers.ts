import type { Product, ProductVariant, Cart, CartLine, ProductMetafields } from "../../../shared/types.js";

// ── Product mapper ──

export function mapProduct(raw: any): Product {
  return {
    id: raw.id,
    handle: raw.handle,
    title: raw.title,
    description: raw.description,
    vendor: raw.vendor,
    productType: raw.productType,
    tags: raw.tags ?? [],
    images: (raw.images?.edges ?? []).map((e: any) => e.node),
    options: raw.options ?? [],
    variants: (raw.variants?.edges ?? []).map((e: any) => mapVariant(e.node)),
    priceRange: raw.priceRange,
    metafields: mapMetafields(raw),
  };
}

function mapVariant(raw: any): ProductVariant {
  return {
    id: raw.id,
    title: raw.title,
    availableForSale: raw.availableForSale,
    quantityAvailable: raw.quantityAvailable ?? null,
    price: raw.price,
    compareAtPrice: raw.compareAtPrice ?? null,
    selectedOptions: raw.selectedOptions ?? [],
    image: raw.image ?? null,
  };
}

function mapMetafields(raw: any): ProductMetafields {
  const meta: ProductMetafields = {};
  if (raw.fitProfile?.value) meta.fitProfile = raw.fitProfile.value;
  if (raw.trueToSizeNote?.value) meta.trueToSizeNote = raw.trueToSizeNote.value;
  if (raw.authenticityNote?.value) meta.authenticityNote = raw.authenticityNote.value;
  if (raw.styleTags?.value) {
    try { meta.styleTags = JSON.parse(raw.styleTags.value); } catch { meta.styleTags = [raw.styleTags.value]; }
  }
  if (raw.materialSummary?.value) meta.materialSummary = raw.materialSummary.value;
  if (raw.recommendedUse?.value) meta.recommendedUse = raw.recommendedUse.value;
  if (raw.compareHighlights?.value) meta.compareHighlights = raw.compareHighlights.value;
  return meta;
}

// ── Cart mapper ──

export function mapCart(raw: any): Cart {
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    lines: (raw.lines?.edges ?? []).map((e: any) => mapCartLine(e.node)),
    cost: raw.cost,
  };
}

function mapCartLine(raw: any): CartLine {
  return {
    id: raw.id,
    quantity: raw.quantity,
    merchandise: {
      id: raw.merchandise.id,
      title: raw.merchandise.title,
      product: raw.merchandise.product,
      image: raw.merchandise.image ?? null,
      price: raw.merchandise.price,
      selectedOptions: raw.merchandise.selectedOptions ?? [],
    },
  };
}
