import { useState } from "react";
import { api, type Paper } from "@/lib/api";

const CITE_STYLES = [
  { value: "apa", label: "APA" },
  { value: "ieee", label: "IEEE" },
  { value: "gb/t7714", label: "GB/T 7714" },
  { value: "chicago", label: "Chicago" },
] as const;

export function CopyCitationDropdown({
  paper,
  onClose,
}: {
  paper: Paper;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(style: string) {
    const text = await api.exportCitations([paper.id], style);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-10 bg-litera-paper border border-litera-line rounded-lg shadow-lg py-1 min-w-[140px]">
      {CITE_STYLES.map((style) => (
        <button
          key={style.value}
          onClick={() => handleCopy(style.value)}
          className="w-full px-3 py-1.5 text-xs text-left text-litera-text hover:bg-litera-panel transition-colors"
        >
          {copied ? "✓" : style.label}
        </button>
      ))}
    </div>
  );
}
