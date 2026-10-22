import { History } from "lucide-react";

/** Slim, persistent reminder that this is a replay with fictional data. */
export function ReplayBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-950">
      <div className="mx-auto flex max-w-6xl items-start gap-2 sm:items-center">
        <History className="mt-0.5 size-3.5 shrink-0 sm:mt-0" aria-hidden />
        <p>
          <strong className="font-semibold">Historical replay with synthetic data.</strong> The recall is a real,
          previously published RappelConso notice replayed for this demo, not a new alert. Kitchens, staff and
          deliveries are fictional.
        </p>
      </div>
    </div>
  );
}
