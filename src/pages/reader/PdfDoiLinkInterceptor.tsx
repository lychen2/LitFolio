import { useEffect, type RefObject } from "react";

interface Props {
  containerRef: RefObject<HTMLElement | null>;
  onDoi: (doi: string) => void;
}

export function PdfDoiLinkInterceptor({ containerRef, onDoi }: Props) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !container.contains(anchor)) return;
      const doi = extractDoi(anchor.href) ?? extractDoi(anchor.textContent ?? "");
      if (!doi) return;
      event.preventDefault();
      event.stopPropagation();
      onDoi(doi);
    };
    container.addEventListener("click", handleClick, true);
    return () => container.removeEventListener("click", handleClick, true);
  }, [containerRef, onDoi]);

  return null;
}

function extractDoi(raw: string): string | null {
  const match = raw.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if (!match) return null;
  return match[0].replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/[.,);>\]}'"]+$/g, "");
}
