import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";

/// Pull a human-readable message out of an unknown thrown value. Use this
/// instead of `(e as Error).message` so we degrade gracefully when the value
/// is a plain string, undefined, or some other shape that bypassed the Error
/// constructor (e.g. a thrown JSON from the tauri bridge).
export function errorMsg(e: unknown): string {
  if (e == null) return "";
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export type UseApiMutationResult<TData, TVariables, TError = Error> =
  UseMutationResult<TData, TError, TVariables> & {
    /** Pre-extracted error message — null when no error is set. */
    errorMessage: string | null;
  };

/// Drop-in for `useMutation` that pre-extracts `error.message` so callers
/// stop reaching for `(error as Error).message` at every render. Same API
/// otherwise; existing options pass through unchanged.
export function useApiMutation<TData = unknown, TVariables = void, TError = Error>(
  options: UseMutationOptions<TData, TError, TVariables>,
): UseApiMutationResult<TData, TVariables, TError> {
  const m = useMutation(options);
  return {
    ...m,
    errorMessage: m.error ? errorMsg(m.error) : null,
  };
}
