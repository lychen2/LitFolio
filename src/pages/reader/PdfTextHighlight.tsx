import type { CSSProperties } from "react";
import { highlightPalette } from "./highlightTypes";

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function PdfTextHighlight({
  rects,
  dark,
  isScrolledTo,
  label,
}: {
  rects: Rect[];
  dark: boolean;
  isScrolledTo: boolean;
  label?: string | null;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {rects.map((rect, index) => (
        <div
          key={index}
          className="absolute rounded-[2px]"
          style={highlightStyle(rect, dark, isScrolledTo, label)}
        />
      ))}
    </div>
  );
}

function highlightStyle(
  rect: Rect,
  dark: boolean,
  isScrolledTo: boolean,
  label: string | null | undefined
): CSSProperties {
  const palette = highlightPalette(label);
  const verticalInset = Math.min(2.5, Math.max(1, rect.height * 0.16));
  const height = Math.max(2, rect.height - verticalInset * 2);

  return {
    top: rect.top + verticalInset,
    left: rect.left,
    width: rect.width,
    height,
    background: dark ? palette.pdfDark : palette.pdf,
    boxShadow: isScrolledTo
      ? `0 0 0 1.5px ${palette.ring}, 0 0 14px ${palette.soft}`
      : "none",
    outline: isScrolledTo
      ? "1px solid color-mix(in srgb, var(--litera-accent2) 70%, transparent)"
      : "none",
  };
}
