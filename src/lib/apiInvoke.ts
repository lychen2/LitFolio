import { invoke } from "@tauri-apps/api/core";

export async function invokeParsed<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  parser: (value: unknown, path: string) => T,
): Promise<T> {
  return parser(await invoke<unknown>(command, args), command);
}
