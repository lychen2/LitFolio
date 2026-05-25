import { Users, Info } from "lucide-react";
import type { SurveyKeyPi } from "@/lib/api";

interface Props {
  keyPis: SurveyKeyPi[];
}

export function KeyPiList({ keyPis }: Props) {
  if (keyPis.length === 0) return null;
  return (
    <aside className="litera-panel p-4 sticky top-4 self-start">
      <h3 className="flex items-center gap-2 text-sm font-medium text-litera-text mb-3">
        <Users className="h-4 w-4 text-litera-accent2" />
        关键学者 ({keyPis.length})
      </h3>
      <ul className="space-y-3 text-sm">
        {keyPis.map((pi) => (
          <li key={pi.name} className="leading-tight">
            <div className="font-medium text-litera-text">{pi.name}</div>
            <div className="text-xs text-litera-mute mt-1 flex items-start gap-1 leading-snug">
              <Info className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
              <span>{pi.why_central}</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
