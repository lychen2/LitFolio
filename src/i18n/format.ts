export type I18nVars = Record<string, string | number | null | undefined>;

export function formatMessage(template: string, vars?: I18nVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? `{${key}}` : String(value);
  });
}
