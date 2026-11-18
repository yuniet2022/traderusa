import { useEffect, useRef, useState } from "react";
import type { Asset } from "@/types";
import type { BrokerAvailability } from "@contracts/availability";
import { marketJSON } from "@/lib/marketClient";

const cache = new Map<string, BrokerAvailability>(),
  pending = new Map<string, Promise<BrokerAvailability>>();
const queue: (() => void)[] = [];
let active = 0;
function load(asset: Asset): Promise<BrokerAvailability> {
  const key = `${asset.assetClass}:${asset.id}`,
    old = cache.get(key);
  if (
    old &&
    Date.now() - old.checkedAt < (old.available === null ? 60000 : 3600000)
  )
    return Promise.resolve(old);
  const shared = pending.get(key);
  if (shared) return shared;
  const task = new Promise<BrokerAvailability>((resolve, reject) => {
    const run = () => {
      active++;
      void marketJSON<BrokerAvailability>("availability", {
        assetClass: asset.assetClass,
        id: asset.id,
      })
        .then(value => {
          cache.set(key, value);
          if (cache.size > 10000) cache.delete(cache.keys().next().value!);
          resolve(value);
        }, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < 3) run();
    else if (queue.length < 64) queue.push(run);
    else reject(Error("Busy"));
  });
  pending.set(key, task);
  void task.finally(() => pending.delete(key)).catch(() => {});
  return task;
}

/** Only positive, public-catalog verification produces a badge. Unknown/negative stay unmarked. */
export function RobinhoodBadge({ asset }: { asset: Asset }) {
  const [verification, setVerification] = useState<{
    key: string;
    verified: boolean;
  } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const { id, assetClass } = asset;
  useEffect(() => {
    let alive = true,
      started = false;
    const query = () => {
      void load({ id, assetClass, symbol: id, name: id }).then(
        v => {
          if (alive)
            setVerification({
              key: `${assetClass}:${id}`,
              verified: v.available === true && v.source === "Robinhood",
            });
        },
        () => {}
      );
    };
    const run = () => {
      if (started) return;
      started = true;
      query();
    };
    const element = ref.current;
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            entries => {
              if (entries.some(e => e.isIntersecting)) {
                run();
                observer?.disconnect();
              }
            },
            { rootMargin: "200px" }
          )
        : null;
    if (observer && element) observer.observe(element);
    else run();
    const timer = window.setInterval(() => {
      if (started && document.visibilityState !== "hidden") query();
    }, 3600000);
    return () => {
      alive = false;
      observer?.disconnect();
      clearInterval(timer);
    };
  }, [id, assetClass]);
  return (
    <span ref={ref} className="inline-flex min-h-px min-w-px">
      {verification?.key === `${assetClass}:${id}` && verification.verified && (
        <span
          title="Listado negociable en el catálogo público de Robinhood; la disponibilidad para operar depende de tu cuenta y región."
          className="rounded border border-emerald-800 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
        >
          En Robinhood
        </span>
      )}
    </span>
  );
}
