import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "../../shared/types";
import { sendMessage, trackEvent } from "../api";
import { nanoid } from "nanoid";

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  cartId: string | null;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  clearError: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartId, setCartId] = useState<string | null>(null);
  const sessionIdRef = useRef(nanoid());
  const lastMessageRef = useRef<string>("");

  const send = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: nanoid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    lastMessageRef.current = text;
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const res = await sendMessage(sessionIdRef.current, text, cartId ?? undefined);

      if (res.cartId) setCartId(res.cartId);

      setMessages((prev) => [...prev, res.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      trackEvent(sessionIdRef.current, "fallback_triggered", { error: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [cartId]);

  const retry = useCallback(async () => {
    if (lastMessageRef.current) {
      // Remove the last user message to avoid duplication
      setMessages((prev) => prev.slice(0, -1));
      await send(lastMessageRef.current);
    }
  }, [send]);

  const clearError = useCallback(() => setError(null), []);

  return { messages, isLoading, error, cartId, send, retry, clearError };
}
