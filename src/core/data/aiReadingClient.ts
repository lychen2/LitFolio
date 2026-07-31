import { aiReaderApi } from "@/lib/apiAiReader";

/**
 * AI Reading client. It temporarily delegates the complete legacy AI/Reader
 * surface so compatibility callers keep identical command arguments and results.
 * `mono-ai-reading-core` removes this adapter after its client migration.
 */
export const aiReadingClient = aiReaderApi;
