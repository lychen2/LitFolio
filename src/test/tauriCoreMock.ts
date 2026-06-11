import { invokeMockCommand } from "./tauriMockCommands";

export class Channel<T = unknown> {
  readonly id = 0;
  onmessage: (response: T) => void;

  constructor(onmessage: (response: T) => void = () => undefined) {
    this.onmessage = onmessage;
  }

  toJSON(): string {
    return String(this.id);
  }
}

export class Resource {
  readonly rid: number;

  constructor(rid: number) {
    this.rid = rid;
  }

  async close(): Promise<void> {
    return undefined;
  }
}

export function transformCallback(): number {
  return 0;
}

export function convertFileSrc(path: string): string {
  return path;
}

export function isTauri(): boolean {
  return false;
}

export async function invoke<T>(command: string, _args?: unknown): Promise<T> {
  return invokeMockCommand<T>(command);
}
