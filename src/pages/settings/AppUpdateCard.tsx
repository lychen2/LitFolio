import { useState } from "react";
import { DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { checkForUpdatesManually, type UpdateOutcome } from "@/lib/autoUpdate";

export function AppUpdateCard() {
  const t = useT();
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<UpdateOutcome | null>(null);

  async function onCheck() {
    setChecking(true);
    setOutcome(null);
    try {
      setOutcome(await checkForUpdatesManually(t));
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="litera-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-litera-text font-medium mb-1 flex items-center gap-2">
            <DownloadCloud className="h-4 w-4 text-litera-accent2" />
            {t("update.section")}
          </h3>
          <p className="text-xs text-litera-mute">{t("update.sectionHint")}</p>
        </div>
        <button onClick={onCheck} disabled={checking} className="litera-btn text-xs disabled:opacity-50">
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {checking ? t("update.checking") : t("update.check")}
        </button>
      </div>
      {outcome && <OutcomeLine outcome={outcome} />}
    </section>
  );
}

function OutcomeLine({ outcome }: { outcome: UpdateOutcome }) {
  const t = useT();
  if (outcome.status === "error") {
    return <div className="mt-3 text-xs text-red-400/90">✕ {t("update.failed", { message: outcome.message })}</div>;
  }
  const text = lineFor(outcome, t);
  if (!text) return null;
  return <div className="mt-3 text-xs text-litera-mute">{text}</div>;
}

function lineFor(outcome: UpdateOutcome, t: ReturnType<typeof useT>): string {
  switch (outcome.status) {
    case "up-to-date":
      return t("update.upToDate");
    case "declined":
      return t("update.declined");
    case "unsupported":
      return t("update.unsupported");
    default:
      return ""; // "updated" relaunches the app; "busy" is transient
  }
}
