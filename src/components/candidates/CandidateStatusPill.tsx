import type { CandidateStatus } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";

export function CandidateStatusPill({ status }: { status: CandidateStatus }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded border border-litera-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-litera-mute">
      {t(`candidate.status.${status}` as TKey)}
    </span>
  );
}
