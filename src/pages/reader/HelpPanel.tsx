import { X } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const t = useT();

  const shortcuts = [
    {
      category: t("reader.helpNavigation"),
      items: [
        { keys: ["j", "]"], label: t("reader.helpNextHighlight") },
        { keys: ["k", "["], label: t("reader.helpPrevHighlight") },
      ],
    },
    {
      category: t("reader.helpHighlights"),
      items: [
        { keys: ["Ctrl+F"], label: t("reader.helpSearchPdf") },
        { keys: ["Alt", "+ drag"], label: t("reader.helpAreaHighlight") },
      ],
    },
    {
      category: t("reader.helpWorkspace"),
      items: [
        { keys: ["1"], label: t("reader.helpNotesTab") },
        { keys: ["2"], label: t("reader.helpTranslateTab") },
        { keys: ["3"], label: t("reader.helpTermsTab") },
      ],
    },
    {
      category: t("reader.helpOther"),
      items: [{ keys: ["?"], label: t("reader.helpToggleHelp") }],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-lg border border-litera-border bg-litera-bg p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-litera-text">
            {t("reader.helpTitle")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-litera-mute transition-colors hover:bg-litera-hover hover:text-litera-text"
            aria-label={t("reader.helpClose")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="mb-2 text-sm font-medium text-litera-accent2">
                {section.category}
              </h3>
              <div className="space-y-1.5">
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-litera-mute">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, keyIdx) => (
                        <kbd
                          key={keyIdx}
                          className="rounded border border-litera-border bg-litera-surface px-2 py-0.5 text-xs font-mono text-litera-text shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="litera-btn text-sm px-3 py-1.5">
            {t("reader.helpClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
