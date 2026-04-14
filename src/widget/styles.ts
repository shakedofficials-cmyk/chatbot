/** All inline styles — premium black/white ORJN aesthetic. No external CSS needed. */

export const colors = {
  black: "#0a0a0a",
  darkGray: "#141414",
  medGray: "#1e1e1e",
  borderGray: "#2a2a2a",
  textPrimary: "#f0f0f0",
  textSecondary: "#999",
  textMuted: "#666",
  white: "#fff",
  accent: "#e0e0e0",
  error: "#ff4444",
  green: "#00c853",
};

export const styles = {
  // ── Launcher ──
  launcher: {
    position: "fixed" as const,
    bottom: "24px",
    right: "24px",
    width: "56px",
    height: "56px",
    borderRadius: "4px",
    background: colors.black,
    border: `1px solid ${colors.borderGray}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  },

  // ── Panel ──
  panel: {
    position: "fixed" as const,
    bottom: "24px",
    right: "24px",
    width: "400px",
    height: "600px",
    maxHeight: "calc(100vh - 48px)",
    background: colors.black,
    border: `1px solid ${colors.borderGray}`,
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column" as const,
    zIndex: 9999,
    boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
    overflow: "hidden",
  },

  panelMobile: {
    width: "100vw",
    height: "100vh",
    maxHeight: "100vh",
    bottom: "0",
    right: "0",
    borderRadius: "0",
  },

  // ── Header ──
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: `1px solid ${colors.borderGray}`,
    background: colors.black,
  },

  headerTitle: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "600" as const,
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    color: colors.white,
    margin: 0,
  },

  headerClose: {
    background: "none",
    border: "none",
    color: colors.textSecondary,
    cursor: "pointer",
    fontSize: "18px",
    padding: "4px",
    lineHeight: 1,
  },

  // ── Messages area ──
  messagesContainer: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },

  // ── Message bubbles ──
  userMessage: {
    alignSelf: "flex-end" as const,
    background: colors.medGray,
    color: colors.textPrimary,
    padding: "10px 14px",
    borderRadius: "4px",
    maxWidth: "85%",
    fontSize: "14px",
    lineHeight: "1.5",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  assistantMessage: {
    alignSelf: "flex-start" as const,
    color: colors.textPrimary,
    padding: "10px 0",
    maxWidth: "95%",
    fontSize: "14px",
    lineHeight: "1.6",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  // ── Product card ──
  productCard: {
    background: colors.darkGray,
    border: `1px solid ${colors.borderGray}`,
    borderRadius: "4px",
    overflow: "hidden",
    marginTop: "8px",
  },

  productImage: {
    width: "100%",
    height: "160px",
    objectFit: "cover" as const,
    display: "block",
  },

  productInfo: {
    padding: "12px",
  },

  productVendor: {
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    color: colors.textSecondary,
    margin: "0 0 4px 0",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  productTitle: {
    fontSize: "14px",
    fontWeight: "500" as const,
    color: colors.white,
    margin: "0 0 6px 0",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  productPrice: {
    fontSize: "14px",
    fontWeight: "600" as const,
    color: colors.white,
    margin: 0,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  compareAtPrice: {
    fontSize: "12px",
    color: colors.textMuted,
    textDecoration: "line-through",
    marginLeft: "8px",
  },

  productButton: {
    display: "block",
    width: "100%",
    padding: "10px",
    background: colors.white,
    color: colors.black,
    border: "none",
    fontSize: "12px",
    fontWeight: "600" as const,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    transition: "opacity 0.15s ease",
  },

  // ── Input ──
  inputContainer: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    borderTop: `1px solid ${colors.borderGray}`,
    background: colors.black,
    gap: "8px",
  },

  input: {
    flex: 1,
    background: colors.darkGray,
    border: `1px solid ${colors.borderGray}`,
    borderRadius: "4px",
    padding: "10px 14px",
    color: colors.textPrimary,
    fontSize: "14px",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    outline: "none",
    resize: "none" as const,
  },

  sendButton: {
    background: colors.white,
    color: colors.black,
    border: "none",
    borderRadius: "4px",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "16px",
    flexShrink: 0,
  },

  // ── States ──
  typingDot: {
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: colors.textSecondary,
    marginRight: "4px",
  },

  errorBar: {
    padding: "10px 16px",
    background: "rgba(255, 68, 68, 0.1)",
    borderTop: `1px solid rgba(255, 68, 68, 0.2)`,
    color: colors.error,
    fontSize: "13px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  retryButton: {
    background: "none",
    border: `1px solid ${colors.error}`,
    color: colors.error,
    padding: "4px 12px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: "40px 20px",
    textAlign: "center" as const,
  },

  emptyTitle: {
    fontSize: "16px",
    fontWeight: "600" as const,
    color: colors.white,
    margin: "0 0 8px 0",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  emptySubtitle: {
    fontSize: "13px",
    color: colors.textSecondary,
    margin: 0,
    lineHeight: "1.5",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },

  // ── Checkout CTA ──
  checkoutButton: {
    display: "block",
    width: "100%",
    padding: "12px",
    background: colors.white,
    color: colors.black,
    border: "none",
    fontSize: "13px",
    fontWeight: "700" as const,
    letterSpacing: "1.5px",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    marginTop: "8px",
    borderRadius: "4px",
  },
};
