import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("orjn-concierge-root");
if (container) {
  try {
    createRoot(container).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("[ORJN] Widget mounted successfully");
  } catch (err) {
    console.error("[ORJN] Widget failed to mount:", err);
    container.innerHTML = `<div style="position:fixed;bottom:24px;right:24px;background:red;color:white;padding:16px;border-radius:4px;z-index:9999;">Widget error: ${err}</div>`;
  }
} else {
  console.error("[ORJN] Root container not found");
}
