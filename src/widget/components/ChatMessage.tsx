import React from "react";
import type { ChatMessage as ChatMessageType, Product } from "../../shared/types";
import { styles, colors } from "../styles";
import { ProductCard } from "./ProductCard";
import { ComparisonCard } from "./ComparisonCard";

interface ChatMessageProps {
  message: ChatMessageType;
  onAddToCart?: (product: Product) => void;
}

export function ChatMessageBubble({ message, onAddToCart }: ChatMessageProps) {
  if (message.role === "user") {
    return <div style={styles.userMessage}>{message.content}</div>;
  }

  return (
    <div style={styles.assistantMessage}>
      {/* Text content */}
      <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>

      {/* Product cards */}
      {message.products && message.products.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          {message.products.slice(0, 4).map((product) => (
            <ProductCard key={product.handle} product={product} onAddToCart={onAddToCart} />
          ))}
        </div>
      )}

      {/* Comparison table */}
      {message.comparison && <ComparisonCard comparison={message.comparison} />}

      {/* Cart action feedback */}
      {message.cartAction?.type === "checkout" && message.cartAction.checkoutUrl && (
        <a
          href={message.cartAction.checkoutUrl}
          target="_top"
          rel="noopener"
          style={{
            ...styles.checkoutButton,
            textDecoration: "none",
            textAlign: "center",
            display: "block",
          }}
        >
          Go to Checkout
        </a>
      )}
    </div>
  );
}
