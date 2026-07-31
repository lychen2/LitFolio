import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

export interface CommandSpec<Args extends InvokeArgs | undefined, Result> {
  command: string;
  parse(value: unknown, path: string, args: Args): Result;
}

export async function invokeCommand<Args extends InvokeArgs | undefined, Result>(
  spec: CommandSpec<Args, Result>,
  args: Args,
): Promise<Result> {
  return spec.parse(await invoke<unknown>(spec.command, args), spec.command, args);
}

export async function invokeParsed<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  parser: (value: unknown, path: string) => T,
): Promise<T> {
  return invokeCommand({ command, parse: parser }, args);
}
