import React, { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "./hooks/useChat";
import { trackEvent } from "./api";
import { ChatMessageBubble } from "./components/ChatMessage";
import { TypingIndicator } from "./components/TypingIndicator";
import { styles, colors } from "./styles";
import type { Product } from "../shared/types";

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const { messages, isLoading, error, cartId, send, retry, clearError } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef(makeId());

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    trackEvent(sessionIdRef.current, "chat_opened");
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue("");
    await send(text);
  }, [inputValue, isLoading, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      send(`I want to add ${product.title} to my cart`);
      trackEvent(sessionIdRef.current, "product_clicked", { handle: product.handle });
    },
    [send]
  );

  // ── Launcher ──
  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        aria-label="Open ORJN concierge"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: 6,
          backgroundColor: "#000",
          border: "1px solid #333",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2147483647,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  // ── Chat panel ──
  return (
    <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : {}) }}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>ORJN</h1>
        <button style={styles.headerClose} onClick={() => setIsOpen(false)} aria-label="Close">
          &#x2715;
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && !isLoading ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>How can I help?</p>
            <p style={styles.emptySubtitle}>
              Search products, check sizes, compare options, or ask about our policies.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} onAddToCart={handleAddToCart} />
            ))}
            {isLoading && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div style={styles.errorBar}>
          <span>{error}</span>
          <button style={styles.retryButton} onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {/* Input */}
      <div style={styles.inputContainer}>
        <textarea
          ref={inputRef}
          style={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about products, sizes, or policies..."
          rows={1}
          disabled={isLoading}
        />
        <button
          style={{
            ...styles.sendButton,
            opacity: inputValue.trim() && !isLoading ? 1 : 0.4,
          }}
          onClick={handleSubmit}
          disabled={!inputValue.trim() || isLoading}
          aria-label="Send message"
        >
          &#x2191;
        </button>
      </div>
    </div>
  );
}
