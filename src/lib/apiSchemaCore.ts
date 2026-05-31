export type Shape = Record<string, unknown>;

export function parseArray<T>(
  value: unknown,
  path: string,
  parser: (item: unknown, path: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw schemaError(path, "array", value);
  }
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

export function parseNullable<T>(
  value: unknown,
  path: string,
  parser: (item: unknown, path: string) => T,
): T | null {
  return value === null ? null : parser(value, path);
}

export function object(value: unknown, path: string): Shape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw schemaError(path, "object", value);
  }
  return value as Shape;
}

export function field(obj: Shape, key: string, path: string): unknown {
  if (!(key in obj)) {
    throw new Error(`Invalid API response at ${path}.${key}: missing field`);
  }
  return obj[key];
}

export function stringField(obj: Shape, key: string, path: string): string {
  const value = field(obj, key, path);
  if (typeof value !== "string") {
    throw schemaError(`${path}.${key}`, "string", value);
  }
  return value;
}

export function nullableStringField(obj: Shape, key: string, path: string): string | null {
  const value = field(obj, key, path);
  if (value === null) return null;
  if (typeof value !== "string") {
    throw schemaError(`${path}.${key}`, "string|null", value);
  }
  return value;
}

export function optionalStringField(obj: Shape, key: string, path: string): string | undefined {
  if (!(key in obj)) return undefined;
  const value = obj[key];
  if (typeof value !== "string") {
    throw schemaError(`${path}.${key}`, "string|undefined", value);
  }
  return value;
}

export function numberField(obj: Shape, key: string, path: string): number {
  const value = field(obj, key, path);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw schemaError(`${path}.${key}`, "finite number", value);
  }
  return value;
}

export function nullableNumberField(obj: Shape, key: string, path: string): number | null {
  const value = field(obj, key, path);
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw schemaError(`${path}.${key}`, "finite number|null", value);
  }
  return value;
}

export function optionalNumberField(obj: Shape, key: string, path: string): number | undefined {
  if (!(key in obj)) return undefined;
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw schemaError(`${path}.${key}`, "finite number|undefined", value);
  }
  return value;
}

export function booleanField(obj: Shape, key: string, path: string): boolean {
  const value = field(obj, key, path);
  if (typeof value !== "boolean") {
    throw schemaError(`${path}.${key}`, "boolean", value);
  }
  return value;
}

export function stringArrayField(obj: Shape, key: string, path: string): string[] {
  return parseArray(field(obj, key, path), `${path}.${key}`, (item, itemPath) => {
    if (typeof item !== "string") {
      throw schemaError(itemPath, "string", item);
    }
    return item;
  });
}

export function enumStringField(
  obj: Shape,
  key: string,
  path: string,
  allowed: Set<string>,
): string {
  const value = stringField(obj, key, path);
  if (!allowed.has(value)) {
    throw schemaError(`${path}.${key}`, `one of ${Array.from(allowed).join(", ")}`, value);
  }
  return value;
}

export function schemaError(path: string, expected: string, actual: unknown): Error {
  return new Error(`Invalid API response at ${path}: expected ${expected}, got ${describe(actual)}`);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
