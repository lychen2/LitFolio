import { FileText } from "lucide-react";
import type { LlmConfig, PdfMarkdownEngine } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";

type EngineOption = {
  value: PdfMarkdownEngine;
  labelKey: TKey;
  hintKey: TKey;
};

const ENGINES: EngineOption[] = [
  { value: "local", labelKey: "pdfMarkdown.engine.local", hintKey: "pdfMarkdown.engine.localHint" },
  { value: "mineru-agent", labelKey: "pdfMarkdown.engine.agent", hintKey: "pdfMarkdown.engine.agentHint" },
  { value: "mineru-precise", labelKey: "pdfMarkdown.engine.precise", hintKey: "pdfMarkdown.engine.preciseHint" },
];

const TOKEN_URL = "https://mineru.net/apiManage/token";
const DOCS_URL = "https://mineru.net/apiManage/docs";

export function PdfMarkdownSettings({
  draft,
  onChange,
}: {
  draft: LlmConfig;
  onChange: (next: LlmConfig) => void;
}) {
  const t = useT();
  const config = draft.pdf_markdown ?? { engine: "mineru-agent", mineru_token: "" };
  const selected = ENGINES.find((engine) => engine.value === config.engine) ?? ENGINES[0];

  function update(patch: Partial<LlmConfig["pdf_markdown"]>) {
    onChange({
      ...draft,
      pdf_markdown: { ...config, ...patch },
    });
  }

  return (
    <section className="litera-panel p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-litera-text flex items-center gap-2">
            <FileText className="h-4 w-4 text-litera-accent" /> {t("pdfMarkdown.title")}
          </h3>
          <p className="text-xs text-litera-mute mt-1">{t("pdfMarkdown.description")}</p>
        </div>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-xs text-litera-accent hover:underline whitespace-nowrap">
          {t("pdfMarkdown.docsLink")}
        </a>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("pdfMarkdown.engineLabel")}</span>
        <select
          value={config.engine}
          onChange={(event) => update({ engine: event.target.value as PdfMarkdownEngine })}
          className="litera-input text-xs max-w-sm"
        >
          {ENGINES.map((engine) => (
            <option key={engine.value} value={engine.value}>{t(engine.labelKey)}</option>
          ))}
        </select>
        <span className="text-[11px] text-litera-mute">{t(selected.hintKey)}</span>
      </label>

      {config.engine === "mineru-precise" && (
        <label className="flex flex-col gap-1 max-w-xl">
          <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("pdfMarkdown.tokenLabel")}</span>
          <input
            type="password"
            value={config.mineru_token}
            onChange={(event) => update({ mineru_token: event.target.value })}
            className="litera-input font-mono text-xs"
            placeholder={t("pdfMarkdown.tokenPlaceholder")}
          />
          <span className="text-[11px] text-litera-mute">
            {t("pdfMarkdown.tokenHint")} {" "}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="text-litera-accent hover:underline">
              {TOKEN_URL}
            </a>
          </span>
        </label>
      )}
    </section>
  );
}
