import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Loader2, KeyRound, Cpu, Workflow, FolderSync, Download, Merge, Search, Trash2, Bell, Play, Eye, CheckCheck, ChevronDown, ChevronRight } from "lucide-react";
import { api, type LlmConfig, type LlmProfile, type TopicAlert } from "@/lib/api";
import { ProfileCard } from "./settings/ProfileCard";
import { SyncPanel } from "./settings/SyncPanel";
import { TaskAssignments } from "./settings/TaskAssignments";
import { useT } from "@/i18n/I18nProvider";
import { TabButton } from "@/components/TabButton";
import type { TKey } from "@/i18n/dict";

type SettingsTab = "profiles" | "tasks" | "sync" | "export" | "tools";

const TAB_DEFS: { key: SettingsTab; labelKey: TKey; icon: typeof Cpu }[] = [
  { key: "profiles", labelKey: "settings.tab.profiles", icon: Cpu },
  { key: "tasks", labelKey: "settings.tab.tasks", icon: Workflow },
  { key: "sync", labelKey: "settings.tab.sync", icon: FolderSync },
  { key: "export", labelKey: "export.title", icon: Download },
  { key: "tools", labelKey: "settings.tab.tools", icon: Search },
];

const PRESETS: { label: string; profile: Partial<LlmProfile> }[] = [
  { label: "OpenAI",      profile: { base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", embed_model: "text-embedding-3-small" } },
  { label: "DeepSeek",    profile: { base_url: "https://api.deepseek.com/v1", chat_model: "deepseek-chat", embed_model: null } },
  { label: "Moonshot",    profile: { base_url: "https://api.moonshot.cn/v1", chat_model: "moonshot-v1-8k", embed_model: null } },
  { label: "SiliconFlow", profile: { base_url: "https://api.siliconflow.cn/v1", chat_model: "Qwen/Qwen2.5-7B-Instruct", embed_model: "BAAI/bge-large-en-v1.5" } },
  { label: "Ollama",      profile: { base_url: "http://localhost:11434/v1", chat_model: "qwen2.5:7b", embed_model: "nomic-embed-text", api_key: "ollama" } },
];

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>("profiles");
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["llm", "config"],
    queryFn: api.llmGetConfig,
  });
  const [draft, setDraft] = useState<LlmConfig>({
    profiles: [],
    active: null,
    output_language: "Chinese",
    task_assignments: {
      tldr: null,
      quick_read: null,
      translate: null,
      tag: null,
      link: null,
      topic_survey: null,
      ask: null,
    },
  });
  useEffect(() => { if (data) setDraft(data); }, [data]);

  const save = useMutation({
    mutationFn: (c: LlmConfig) => api.llmSaveConfig(c),
    onSuccess: () => refetch(),
  });

  function upsert(profile: LlmProfile, originalName?: string) {
    setDraft((d) => {
      const profiles = d.profiles.filter((p) => p.name !== (originalName ?? profile.name));
      profiles.push(profile);
      const active = d.active === originalName ? profile.name : (d.active ?? profile.name);
      return { ...d, profiles, active };
    });
  }
  function remove(name: string) {
    setDraft((d) => ({
      ...d,
      profiles: d.profiles.filter((p) => p.name !== name),
      active: d.active === name ? null : d.active,
      task_assignments: Object.fromEntries(
        Object.entries(d.task_assignments).map(([k, v]) => [k, v?.profile === name ? null : v])
      ) as LlmConfig["task_assignments"],
    }));
  }
  function setActive(name: string) {
    setDraft((d) => ({ ...d, active: name }));
  }
  const activeMissing = !!(draft.active && !draft.profiles.some((p) => p.name === draft.active));

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-litera-mute">{t("settings.subtitle")}</p>
        </div>
        <button
          onClick={() => save.mutate(draft)}
          disabled={save.isPending}
          className="litera-btn-primary disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </header>

      <nav className="px-6 pt-4 flex gap-1">
        {TAB_DEFS.map(({ key, labelKey, icon: Icon }) => (
          <TabButton
            key={key}
            active={tab === key}
            onClick={() => setTab(key)}
            icon={<Icon className="h-3.5 w-3.5" />}
            label={t(labelKey)}
          />
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-6 max-w-4xl">
        <div key={tab} className="litera-fade-in">
        {tab === "profiles" && (
          <ProfilesTab
            draft={draft}
            isLoading={isLoading}
            activeMissing={activeMissing}
            onUpsert={upsert}
            onRemove={remove}
            onSetActive={setActive}
          />
        )}
        {tab === "tasks" && <TaskAssignments draft={draft} onChange={setDraft} />}
        {tab === "sync" && <SyncPanel />}
        {tab === "export" && <ExportPanel />}
        {tab === "tools" && (
          <div className="space-y-8">
            <TopicAlertsPanel />
            <DuplicatesPanel />
            <CustomFieldsManager />
          </div>
        )}

        {save.error && <div className="text-sm text-red-400/90 mt-3">✕ {(save.error as Error).message}</div>}
        {save.isSuccess && <div className="text-sm text-litera-accent mt-3">{t("settings.saved")}</div>}
        </div>
      </div>
    </section>
  );
}

function ProfilesTab({
  draft, isLoading, activeMissing, onUpsert, onRemove, onSetActive,
}: {
  draft: LlmConfig;
  isLoading: boolean;
  activeMissing: boolean;
  onUpsert: (profile: LlmProfile, originalName?: string) => void;
  onRemove: (name: string) => void;
  onSetActive: (name: string) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="mb-4">
        <p className="text-xs text-litera-mute">{t("settings.llmHint")}</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onUpsert(blankProfile(p.profile))}
            className="litera-btn text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-litera-mute text-sm">{t("common.loading")}</div>
      ) : draft.profiles.length === 0 ? (
        <div className="litera-panel p-8 text-center">
          <KeyRound className="h-8 w-8 mx-auto mb-2 text-litera-mute" />
          <p className="text-sm text-litera-text">{t("settings.emptyTitle")}</p>
          <p className="text-xs text-litera-mute mt-1">{t("settings.emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3 litera-stagger">
          {draft.profiles.map((p, i) => (
            <ProfileCard
              key={`profile-${i}`}
              profile={p}
              isActive={draft.active === p.name}
              onChange={(np, oldName) => onUpsert(np, oldName)}
              onRemove={() => onRemove(p.name)}
              onActivate={() => onSetActive(p.name)}
            />
          ))}
        </ul>
      )}

      {activeMissing && (
        <div className="mt-3 text-sm text-red-400/90">
          {t("settings.activeMissing", { profile: draft.active })}
        </div>
      )}
    </>
  );
}

function blankProfile(preset?: Partial<LlmProfile>): LlmProfile {
  return {
    name: preset?.chat_model ? `${preset.chat_model}` : "new",
    base_url: preset?.base_url ?? "https://api.openai.com/v1",
    api_key: preset?.api_key ?? "",
    chat_model: preset?.chat_model ?? "gpt-4o-mini",
    embed_model: preset?.embed_model ?? null,
    max_tokens: 1024,
    temperature: 0.3,
  };
}

function ExportPanel() {
  const t = useT();
  const { data: exportDir, refetch } = useQuery({
    queryKey: ["exportDir"],
    queryFn: api.exportMarkdownDir,
  });
  const [result, setResult] = useState<string | null>(null);

  const setDir = useMutation({
    mutationFn: (dir: string) => api.exportMarkdownSetDir(dir),
    onSuccess: () => {
      refetch();
      setResult(null);
    },
  });

  const exportAll = useMutation({
    mutationFn: (incremental: boolean) => api.exportMarkdownAll(incremental),
    onSuccess: (data) => {
      setResult(t("export.done", { exported: data.exported, skipped: data.skipped }));
    },
  });

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) {
      setDir.mutate(selected);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-litera-text mb-1">{t("export.title")}</h3>
        <p className="text-xs text-litera-mute">{t("export.subtitle")}</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-litera-mute">{t("export.dirLabel")}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={exportDir ?? ""}
            readOnly
            placeholder={t("export.dirPlaceholder")}
            className="flex-1 px-3 py-1.5 text-sm bg-litera-panel border border-litera-line rounded-md text-litera-text placeholder:text-litera-mute"
          />
          <button onClick={handleBrowse} className="litera-btn text-xs">
            {t("export.browse")}
          </button>
        </div>
        <p className="text-[11px] text-litera-mute">{t("export.dirHint")}</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => exportAll.mutate(false)}
          disabled={exportAll.isPending || !exportDir}
          className="litera-btn-primary text-xs disabled:opacity-50"
        >
          {exportAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t("export.exportAll")}
        </button>
        <button
          onClick={() => exportAll.mutate(true)}
          disabled={exportAll.isPending || !exportDir}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {t("export.exportIncremental")}
        </button>
      </div>

      {exportAll.error && (
        <div className="text-sm text-red-400/90">✕ {(exportAll.error as Error).message}</div>
      )}
      {result && <div className="text-sm text-litera-accent">{result}</div>}
      {!exportDir && <div className="text-xs text-litera-mute">{t("export.noDir")}</div>}
    </div>
  );
}

function DuplicatesPanel() {
  const t = useT();
  const [pairs, setPairs] = useState<import("@/lib/api").DuplicatePair[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const scanMut = useMutation({
    mutationFn: api.paperScanDuplicates,
    onSuccess: (data) => { setPairs(data); setDismissed(new Set()); },
  });

  const mergeMut = useMutation({
    mutationFn: ({ keepId, mergeId }: { keepId: string; mergeId: string }) =>
      api.paperMerge(keepId, mergeId),
    onSuccess: () => scanMut.mutate(),
  });

  const reasonLabel = (r: string) => {
    if (r === "doi_match") return t("dedup.reasonDoi");
    if (r === "arxiv_match") return t("dedup.reasonArxiv");
    return t("dedup.reasonTitle");
  };

  const visiblePairs = pairs?.filter((_, i) => !dismissed.has(i)) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-litera-text mb-1">{t("dedup.title")}</h3>
        <p className="text-xs text-litera-mute">
          {pairs === null
            ? t("dedup.description")
            : visiblePairs.length === 0
            ? t("dedup.noDuplicates")
            : t("dedup.found", { count: String(visiblePairs.length) })}
        </p>
      </div>

      <button
        onClick={() => scanMut.mutate()}
        disabled={scanMut.isPending}
        className="litera-btn-primary text-xs disabled:opacity-50"
      >
        {scanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {scanMut.isPending ? t("dedup.scanning") : t("dedup.scan")}
      </button>

      {scanMut.error && (
        <div className="text-sm text-red-400/90">✕ {(scanMut.error as Error).message}</div>
      )}

      {visiblePairs.map((pair, _idx) => {
        const globalIdx = pairs!.indexOf(pair);
        return (
          <div key={globalIdx} className="border border-litera-line rounded-lg p-3 space-y-2">
            <div className="text-[10px] text-litera-mute uppercase tracking-wider">
              {t("dedup.reason")}: {reasonLabel(pair.reason)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PaperMiniCard paper={pair.paper_a} />
              <PaperMiniCard paper={pair.paper_b} />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  if (confirm(t("dedup.mergeConfirm"))) {
                    mergeMut.mutate({ keepId: pair.paper_a.id, mergeId: pair.paper_b.id });
                  }
                }}
                disabled={mergeMut.isPending}
                className="litera-btn-primary text-xs flex-1"
              >
                <Merge className="h-3 w-3" /> {t("dedup.keepLeft")}
              </button>
              <button
                onClick={() => {
                  if (confirm(t("dedup.mergeConfirm"))) {
                    mergeMut.mutate({ keepId: pair.paper_b.id, mergeId: pair.paper_a.id });
                  }
                }}
                disabled={mergeMut.isPending}
                className="litera-btn-primary text-xs flex-1"
              >
                <Merge className="h-3 w-3" /> {t("dedup.keepRight")}
              </button>
              <button
                onClick={() => setDismissed((s) => new Set(s).add(globalIdx))}
                className="litera-btn text-xs"
              >
                {t("dedup.dismiss")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaperMiniCard({ paper }: { paper: import("@/lib/api").Paper }) {
  return (
    <div className="bg-litera-panel/50 rounded p-2 text-xs">
      <div className="font-medium text-litera-text truncate">{paper.title}</div>
      <div className="text-litera-mute mt-0.5">
        {paper.authors.slice(0, 2).join(", ")}
        {paper.year && ` · ${paper.year}`}
      </div>
      {paper.doi && <div className="text-[10px] text-litera-mute mt-0.5 truncate">DOI: {paper.doi}</div>}
      {paper.arxiv_id && <div className="text-[10px] text-litera-mute truncate">arXiv: {paper.arxiv_id}</div>}
    </div>
  );
}

const FIELD_TYPES = [
  { value: "text", labelKey: "customFields.typeText" },
  { value: "number", labelKey: "customFields.typeNumber" },
  { value: "date", labelKey: "customFields.typeDate" },
  { value: "select", labelKey: "customFields.typeSelect" },
] as const;

function CustomFieldsManager() {
  const t = useT();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState("");

  const { data: defs = [] } = useQuery({
    queryKey: ["custom-field-defs"],
    queryFn: api.customFieldDefsList,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const opts = newType === "select" && newOptions.trim()
        ? newOptions.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      return api.customFieldDefCreate(newName.trim(), newType, opts);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-field-defs"] });
      setShowCreate(false);
      setNewName("");
      setNewType("text");
      setNewOptions("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.customFieldDefDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-field-defs"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-litera-text">{t("customFields.title")}</h3>
          <p className="text-xs text-litera-mute">{t("customFields.description")}</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="litera-btn text-xs">
          <Plus className="h-3.5 w-3.5" /> {t("customFields.create")}
        </button>
      </div>

      {showCreate && (
        <div className="border border-litera-line rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("customFields.name")}
              className="litera-input text-xs flex-1"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="litera-input text-xs w-32"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>{t(ft.labelKey as any)}</option>
              ))}
            </select>
          </div>
          {newType === "select" && (
            <input
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              placeholder={t("customFields.options")}
              className="litera-input text-xs w-full"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
              className="litera-btn-primary text-xs disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.create")}
            </button>
            <button onClick={() => setShowCreate(false)} className="litera-btn text-xs">
              {t("smartCollections.cancel")}
            </button>
          </div>
          {createMut.error && (
            <p className="text-xs text-red-400">{(createMut.error as Error).message}</p>
          )}
        </div>
      )}

      {defs.length === 0 && !showCreate ? (
        <p className="text-xs text-litera-mute">{t("customFields.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {defs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 rounded border border-litera-line text-xs">
              <span className="font-medium text-litera-text">{d.name}</span>
              <span className="text-litera-mute">({d.field_type})</span>
              {d.options && (
                <span className="text-litera-mute">[{d.options.join(", ")}]</span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => deleteMut.mutate(d.id)}
                className="text-litera-mute hover:text-red-400"
                title={t("customFields.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Topic Alerts Panel ──────────────────────────────────────────────

const FREQUENCIES: { value: string; labelKey: TKey }[] = [
  { value: "daily", labelKey: "alerts.freqDaily" },
  { value: "weekly", labelKey: "alerts.freqWeekly" },
  { value: "on_launch", labelKey: "alerts.freqOnLaunch" },
];

function TopicAlertsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [newFreq, setNewFreq] = useState("weekly");
  const [newAutoImport, setNewAutoImport] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ["topic-alerts"],
    queryFn: api.topicAlertsList,
  });

  const createMut = useMutation({
    mutationFn: () => api.topicAlertCreate(newQuery.trim(), newFreq, null, newAutoImport),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic-alerts"] });
      setShowCreate(false);
      setNewQuery("");
      setNewFreq("weekly");
      setNewAutoImport(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.topicAlertDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });

  const runMut = useMutation({
    mutationFn: (alertId: number) => api.topicAlertRun(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });

  const runAllMut = useMutation({
    mutationFn: () => api.topicAlertRunAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alerts"] }),
  });

  const freqLabel = (f: string) => {
    const entry = FREQUENCIES.find((x) => x.value === f);
    return entry ? t(entry.labelKey) : f;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-litera-text">{t("alerts.title")}</h3>
          <p className="text-xs text-litera-mute">{t("alerts.description")}</p>
        </div>
        <div className="flex gap-2">
          {alerts.length > 0 && (
            <button
              onClick={() => runAllMut.mutate()}
              disabled={runAllMut.isPending}
              className="litera-btn text-xs disabled:opacity-50"
            >
              {runAllMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {t("alerts.runAll")}
            </button>
          )}
          <button onClick={() => setShowCreate(!showCreate)} className="litera-btn text-xs">
            <Plus className="h-3.5 w-3.5" /> {t("alerts.create")}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="border border-litera-line rounded-lg p-3 space-y-2">
          <input
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            placeholder={t("alerts.query")}
            className="litera-input text-xs w-full"
          />
          <div className="flex gap-2 items-center">
            <select
              value={newFreq}
              onChange={(e) => setNewFreq(e.target.value)}
              className="litera-input text-xs w-32"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{t(f.labelKey as any)}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-litera-mute">
              <input
                type="checkbox"
                checked={newAutoImport}
                onChange={(e) => setNewAutoImport(e.target.checked)}
                className="rounded"
              />
              {t("alerts.autoImport")}
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMut.mutate()}
              disabled={!newQuery.trim() || createMut.isPending}
              className="litera-btn-primary text-xs disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("common.create")}
            </button>
            <button onClick={() => setShowCreate(false)} className="litera-btn text-xs">
              {t("common.cancel")}
            </button>
          </div>
          {createMut.error && (
            <p className="text-xs text-red-400">{(createMut.error as Error).message}</p>
          )}
        </div>
      )}

      {alerts.length === 0 && !showCreate ? (
        <p className="text-xs text-litera-mute">{t("alerts.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              expanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
              onRun={() => runMut.mutate(alert.id)}
              onDelete={() => deleteMut.mutate(alert.id)}
              running={runMut.isPending}
              freqLabel={freqLabel}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertCard({
  alert, expanded, onToggle, onRun, onDelete, running, freqLabel,
}: {
  alert: TopicAlert;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  running: boolean;
  freqLabel: (f: string) => string;
}) {
  const t = useT();
  const qc = useQueryClient();

  const { data: results = [] } = useQuery({
    queryKey: ["topic-alert-results", alert.id],
    queryFn: () => api.topicAlertResultsList(alert.id, false),
    enabled: expanded,
  });

  const markSeenMut = useMutation({
    mutationFn: (resultId: number) => api.topicAlertResultMarkSeen(resultId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alert-results", alert.id] }),
  });

  const markAllSeenMut = useMutation({
    mutationFn: () => api.topicAlertMarkAllSeen(alert.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic-alert-results", alert.id] }),
  });

  const unseenCount = results.filter((r) => !r.seen).length;

  const formatTime = (ts: number | null) => {
    if (!ts) return t("alerts.never");
    return new Date(ts * 1000).toLocaleString();
  };

  return (
    <li className="border border-litera-line rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-litera-panel/50 transition-colors"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-litera-mute" /> : <ChevronRight className="h-3.5 w-3.5 text-litera-mute" />}
        <Bell className="h-3.5 w-3.5 text-litera-accent" />
        <span className="text-sm font-medium text-litera-text flex-1 truncate">{alert.query}</span>
        <span className="text-[10px] text-litera-mute">{freqLabel(alert.frequency)}</span>
        {unseenCount > 0 && (
          <span className="text-[10px] bg-litera-accent/20 text-litera-accent px-1.5 py-0.5 rounded-full">
            {unseenCount}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={running}
          className="litera-btn text-[10px] px-1.5 py-0.5 disabled:opacity-50"
          title={t("alerts.run")}
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-litera-mute hover:text-red-400"
          title={t("alerts.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-litera-line px-3 py-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-litera-mute">
            <span>{t("alerts.lastRun")}: {formatTime(alert.last_run_at)}</span>
            {unseenCount > 0 && (
              <button
                onClick={() => markAllSeenMut.mutate()}
                className="flex items-center gap-1 text-litera-accent hover:underline"
              >
                <CheckCheck className="h-3 w-3" /> {t("alerts.markAllSeen")}
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <p className="text-xs text-litera-mute py-2">{t("alerts.noResults")}</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-auto">
              {results.map((r) => (
                <li
                  key={r.id}
                  className={"flex items-start gap-2 px-2 py-1.5 rounded text-xs " + (r.seen ? "opacity-60" : "")}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-litera-text truncate">{r.title}</div>
                    <div className="text-litera-mute truncate">
                      {r.authors ?? "(unknown)"}
                      {r.year && ` · ${r.year}`}
                    </div>
                    {r.abstract_text && (
                      <div className="text-litera-mute/70 mt-0.5 line-clamp-2">{r.abstract_text}</div>
                    )}
                  </div>
                  {!r.seen && (
                    <button
                      onClick={() => markSeenMut.mutate(r.id)}
                      className="shrink-0 text-litera-mute hover:text-litera-accent"
                      title={t("alerts.markSeen")}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
