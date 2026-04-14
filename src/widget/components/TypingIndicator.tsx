import React from "react";
import { colors } from "../styles";

export function TypingIndicator() {
  return (
    <div style={{ alignSelf: "flex-start", padding: "10px 0", display: "flex", gap: "4px" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: colors.textSecondary,
            animation: `orjnPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes orjnPulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
