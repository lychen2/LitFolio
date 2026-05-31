import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";

export function MessageScreen({
  icon,
  title,
  subtitle,
  backLink,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  backLink: string;
}) {
  const t = useT();
  return (
    <section className="h-full grid place-items-center text-center">
      <div>
        {icon && <div className="mb-2 flex justify-center">{icon}</div>}
        <div className="text-sm text-litera-text">{title}</div>
        {subtitle && <div className="text-xs text-litera-mute mt-1">{subtitle}</div>}
        <Link to={backLink} className="litera-btn text-xs mt-4 inline-flex">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("reader.backToLibrary")}
        </Link>
      </div>
    </section>
  );
}
