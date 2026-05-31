export function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as Record<string, unknown>;
  if (typeof e.message === "string" && (e.message as string).length > 0) return e.message as string;
  if (typeof e.cause === "string" && (e.cause as string).length > 0) return e.cause as string;
  if (typeof e.toString === "function") {
    try {
      const text = (e.toString as () => string)();
      return text === "[object Object]" ? "" : text;
    } catch {
      // ignore
    }
  }
  return "";
}

export function errorMessageOr(error: unknown, fallback: string): string {
  const message = errorMessage(error).trim();
  return message || fallback;
}
