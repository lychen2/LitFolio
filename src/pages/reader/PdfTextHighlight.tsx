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
}: {
  rects: Rect[];
  dark: boolean;
  isScrolledTo: boolean;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {rects.map((rect, index) => (
        <div
          key={index}
          className="absolute rounded-[2px]"
          style={highlightStyle(rect, dark, isScrolledTo)}
        />
      ))}
    </div>
  );
}

function highlightStyle(rect: Rect, dark: boolean, isScrolledTo: boolean) {
  if (isScrolledTo) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: dark ? "rgba(72, 198, 255, 0.5)" : "rgba(76, 178, 255, 0.36)",
      boxShadow: dark
        ? "0 0 0 1.5px rgba(170, 236, 255, 0.98)"
        : "0 0 0 1.5px rgba(39, 146, 255, 0.9)",
    } as const;
  }
  if (dark) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: "rgba(255, 214, 74, 0.34)",
      boxShadow: "0 0 0 1px rgba(255, 202, 40, 0.8)",
    } as const;
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    background: "rgba(255, 220, 90, 0.4)",
    boxShadow: "0 0 0 1px rgba(255, 190, 48, 0.82)",
  } as const;
}
