import type { PageContext } from "../shared/types";

export interface NudgeCopy {
  title: string;
  text: string;
}

function cleanHandle(value: string | undefined): string | undefined {
  return value?.split("/").filter(Boolean).pop()?.trim() || undefined;
}

export function detectPageContextFromUrl(url: string): PageContext {
  const parsed = new URL(url);
  const path = parsed.pathname || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) {
    return { type: "home", path };
  }

  if (parts[0] === "products") {
    return { type: "product", handle: cleanHandle(path), path };
  }

  if (parts[0] === "collections") {
    return { type: "collection", handle: parts[1], path };
  }

  if (parts[0] === "search") {
    return { type: "search", path, query: parsed.searchParams.get("q") ?? undefined };
  }

  return { type: "other", path };
}

export function nudgeCopyForPageContext(context: PageContext): NudgeCopy {
  if (context.type === "product") {
    return {
      title: "Need your size?",
      text: "Need your size in this pair?",
    };
  }

  if (context.type === "collection" || context.type === "search") {
    return {
      title: "Filter faster",
      text: "Want this filtered by size or color?",
    };
  }

  return {
    title: "Ask ORJN",
    text: "Your size. Live stock. Fast.",
  };
}
