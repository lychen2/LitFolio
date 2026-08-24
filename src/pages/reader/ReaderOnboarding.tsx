import { useState, useEffect } from "react";
import { BookOpen, FileText, Languages, Orbit, Keyboard } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";

const STORAGE_KEY = "litera.reader.onboarded";

export function ReaderOnboarding() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") {
        setShow(true);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-litera-ink/60 backdrop-blur-sm grid place-items-center p-4" onClick={dismiss}>
      <div className="litera-panel p-6 max-w-md space-y-4 litera-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-litera-accent">
          <BookOpen className="h-5 w-5" />
          <h2 className="font-serif text-lg">{t("reader.onboard.title")}</h2>
        </div>
        <div className="space-y-3 text-sm text-litera-text/90">
          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-litera-warn mt-0.5 shrink-0" />
            <span>{t("reader.onboard.highlights")}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Languages className="h-4 w-4 text-litera-accent mt-0.5 shrink-0" />
            <span>{t("reader.onboard.pdf")}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Orbit className="h-4 w-4 text-litera-accent2 mt-0.5 shrink-0" />
            <span>{t("reader.onboard.workspace")}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Keyboard className="h-4 w-4 text-litera-mute mt-0.5 shrink-0" />
            <span className="text-litera-mute">{t("reader.onboard.shortcuts")}</span>
          </div>
        </div>
        <button onClick={dismiss} className="litera-btn-primary text-sm px-4 py-1.5 w-full">
          {t("reader.onboard.gotIt")}
        </button>
      </div>
    </div>
  );
}
