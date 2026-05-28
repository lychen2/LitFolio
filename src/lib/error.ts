export function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const e = error as Record<string, unknown>;
  if (typeof e.message === "string" && (e.message as string).length > 0) return e.message as string;
  if (typeof e.toString === "function") {
    try {
      return (e.toString as () => string)();
    } catch {
      // ignore
    }
  }
  return "";
}
