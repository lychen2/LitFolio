import { libraryApi } from "@/lib/apiLibrary";
export type { Paper } from "@/lib/types/api";

/**
 * Public core library data client. The legacy module remains the validated
 * command/parser owner until `mono-plugin-library-plus` migrates its callers.
 */
export const libraryClient = libraryApi;
