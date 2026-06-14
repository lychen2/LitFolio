import { useEffect, useState } from "react";

/**
 * Hook to detect window width and determine reader layout mode.
 * Returns true for narrow screens where single-column + drawer is preferred.
 */
export function useNarrowLayout(breakpoint = 1200): boolean {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsNarrow(window.innerWidth < breakpoint);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isNarrow;
}
