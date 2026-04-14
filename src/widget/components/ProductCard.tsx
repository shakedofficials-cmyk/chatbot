import React from "react";
import type { Product } from "../../shared/types";
import { styles, colors } from "../styles";

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const image = product.images[0];
  const price = product.priceRange.minVariantPrice;
  const compareAt = product.variants[0]?.compareAtPrice;
  const isOnSale = compareAt && parseFloat(compareAt.amount) > parseFloat(price.amount);

  return (
    <div style={styles.productCard}>
      {image && (
        <img
          src={image.url}
          alt={image.altText || product.title}
          style={styles.productImage}
          loading="lazy"
        />
      )}
      <div style={styles.productInfo}>
        <p style={styles.productVendor}>{product.vendor}</p>
        <p style={styles.productTitle}>{product.title}</p>
        <p style={styles.productPrice}>
          {price.currencyCode} {parseFloat(price.amount).toFixed(2)}
          {isOnSale && (
            <span style={styles.compareAtPrice}>
              {parseFloat(compareAt.amount).toFixed(2)}
            </span>
          )}
        </p>
        {product.metafields.fitProfile && (
          <p style={{ fontSize: "11px", color: colors.textSecondary, margin: "4px 0 0" }}>
            Fit: {product.metafields.fitProfile}
          </p>
        )}
      </div>
      {onAddToCart && (
        <button
          style={styles.productButton}
          onClick={() => onAddToCart(product)}
          onMouseOver={(e) => ((e.target as HTMLElement).style.opacity = "0.85")}
          onMouseOut={(e) => ((e.target as HTMLElement).style.opacity = "1")}
        >
          View &amp; Add to Cart
        </button>
      )}
    </div>
  );
}
