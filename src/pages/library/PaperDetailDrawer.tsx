import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ClipboardCopy, Download, ExternalLink, FileText, Languages, Loader2, Quote, Sparkles, X,
} from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { ExportCitationsDialog } from "@/components/ExportCitationsDialog";
import { SimilarPapersPanel } from "./SimilarPapersPanel";

export function PaperDetailDrawer({
  paper, onClose,
}: {
  paper: Paper;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const t = useT();
  const [showSimilar, setShowSimilar] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCiteDropdown, setShowCiteDropdown] = useState(false);
  const translate = useMutation({
    mutationFn: () => api.paperTranslate(paper.id, llmLanguageNameFor(lang)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm litera-drawer-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col litera-drawer-enter"
      >
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2">library metadata</div>
            <h2 className="font-serif text-xl leading-tight mt-1">{paper.title}</h2>
            {paper.title_translated && <p className="text-sm text-litera-accent mt-2">{paper.title_translated}</p>}
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            翻译标题和摘要
          </button>
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="litera-btn text-xs"
              title={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> {t("reader.copyBibtex")}
            </button>
          )}
          <button
            onClick={() => setShowSimilar(true)}
            className="litera-btn text-xs"
            title={t("similar.find")}
          >
            <Sparkles className="h-3.5 w-3.5" /> {t("similar.find")}
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="litera-btn text-xs"
            title={t("citations.title")}
          >
            <Download className="h-3.5 w-3.5" /> {t("citations.title")}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowCiteDropdown(!showCiteDropdown)}
              className="litera-btn text-xs"
              title={t("citations.title")}
            >
              <Quote className="h-3.5 w-3.5" />
            </button>
            {showCiteDropdown && (
              <CopyCitationDropdown
                paper={paper}
                onClose={() => setShowCiteDropdown(false)}
              />
            )}
          </div>
          {paper.pdf_path && (
            <Link to={`/reader/${paper.id}`} className="litera-btn-primary text-xs">
              <BookOpen className="h-3.5 w-3.5" /> 阅读 PDF
            </Link>
          )}
        </div>

        {showSimilar && (
          <SimilarPapersPanel
            paperId={paper.id}
            paperTitle={paper.title}
            onClose={() => setShowSimilar(false)}
          />
        )}
        {showExport && (
          <ExportCitationsDialog
            paperIds={[paper.id]}
            onClose={() => setShowExport(false)}
          />
        )}

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <Meta paper={paper} />
          <Section title="摘要" body={paper.abstract_text ?? "(无摘要)"} />
          {paper.abstract_translated && <Section title="摘要译文" body={paper.abstract_translated} accent />}
          {paper.tldr && <Section title="速读" body={paper.tldr} accent />}
          {paper.key_findings.length > 0 && <Section title="关键发现" body={paper.key_findings.join("\n")} />}
          <CustomFieldsSection paperId={paper.id} />
          {translate.error && <ErrorLine error={translate.error} />}
        </div>
      </div>
    </div>
  );
}

function Meta({ paper }: { paper: Paper }) {
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">作者</dt>
      <dd>{paper.authors.join(", ") || "(unknown)"}</dd>
      <dt className="text-litera-mute">年份</dt>
      <dd>{paper.year ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">Venue</dt>
      <dd>{paper.venue ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">DOI</dt>
      <dd className="font-mono">{paper.doi ?? "(none)"}</dd>
      <dt className="text-litera-mute">arXiv</dt>
      <dd>{paper.arxiv_id ? <ArxivLink id={paper.arxiv_id} /> : "(none)"}</dd>
      <dt className="text-litera-mute">PDF</dt>
      <dd className="font-mono break-all flex items-start gap-1">
        {paper.pdf_path ? <><FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />{paper.pdf_path}</> : "(none)"}
      </dd>
    </dl>
  );
}

function ArxivLink({ id }: { id: string }) {
  return (
    <a
      href={`https://arxiv.org/abs/${id}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-1"
    >
      {id}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{title}</h3>
      <p className={"text-sm leading-relaxed whitespace-pre-wrap " + (accent ? "text-litera-accent" : "text-litera-text")}>
        {body}
      </p>
    </section>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="text-sm text-red-400/90">✕ 翻译失败: {message}</div>;
}

function CustomFieldsSection({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: defs = [] } = useQuery({
    queryKey: ["custom-field-defs"],
    queryFn: api.customFieldDefsList,
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["paper-custom-fields", paperId],
    queryFn: () => api.paperCustomFieldsGet(paperId),
  });

  const setMut = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: number; value: string }) =>
      api.paperCustomFieldSet(paperId, fieldId, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-custom-fields", paperId] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (fieldId: number) => api.paperCustomFieldDelete(paperId, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-custom-fields", paperId] }),
  });

  if (defs.length === 0) return null;

  const fieldMap = new Map(fields.map((f) => [f.field_id, f]));

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("customFields.title")}</h3>
      <dl className="space-y-2">
        {defs.map((def) => {
          const existing = fieldMap.get(def.id);
          const isEditing = editingId === def.id;
          return (
            <div key={def.id} className="flex items-center gap-2 text-sm">
              <dt className="text-litera-mute w-28 shrink-0">{def.name}</dt>
              <dd className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    {def.field_type === "select" && def.options ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="litera-input text-xs py-0.5 flex-1"
                      >
                        <option value="">--</option>
                        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : def.field_type === "date" ? (
                      <input
                        type="date"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="litera-input text-xs py-0.5 flex-1"
                      />
                    ) : def.field_type === "number" ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="litera-input text-xs py-0.5 flex-1"
                      />
                    ) : (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="litera-input text-xs py-0.5 flex-1"
                      />
                    )}
                    <button
                      onClick={() => setMut.mutate({ fieldId: def.id, value: editValue })}
                      disabled={setMut.isPending}
                      className="litera-btn-primary text-[10px] px-2 py-0.5"
                    >
                      OK
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-litera-mute text-[10px]">✕</button>
                  </div>
                ) : (
                  <span
                    className="cursor-pointer hover:text-litera-accent"
                    onClick={() => {
                      setEditingId(def.id);
                      setEditValue(existing?.value ?? "");
                    }}
                  >
                    {existing?.value || <span className="text-litera-mute italic">--</span>}
                  </span>
                )}
              </dd>
              {existing && !isEditing && (
                <button
                  onClick={() => deleteMut.mutate(def.id)}
                  className="text-litera-mute hover:text-red-400 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const CITE_STYLES = [
  { value: "apa", label: "APA" },
  { value: "ieee", label: "IEEE" },
  { value: "gb/t7714", label: "GB/T 7714" },
  { value: "chicago", label: "Chicago" },
] as const;

function CopyCitationDropdown({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(style: string) {
    const text = await api.exportCitations([paper.id], style);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1200);
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-10 bg-litera-paper border border-litera-line rounded-lg shadow-lg py-1 min-w-[140px]">
      {CITE_STYLES.map((s) => (
        <button
          key={s.value}
          onClick={() => handleCopy(s.value)}
          className="w-full px-3 py-1.5 text-xs text-left text-litera-text hover:bg-litera-panel transition-colors"
        >
          {copied ? "✓" : s.label}
        </button>
      ))}
    </div>
  );
}
