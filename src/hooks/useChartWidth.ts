import { useEffect, useRef, useState } from 'react';

/** Match SVG coordinates to its container so labels and candles keep their size. */
export function useChartWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}
