import { useEffect, useState } from "react";

export function useMarketClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    };
    const timer = window.setInterval(update, 5000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return now;
}
