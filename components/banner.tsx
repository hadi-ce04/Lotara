import { History } from "lucide-react";

export function ReplayBanner() {
  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <History className="size-4 shrink-0" aria-hidden />
        <p>
          <strong>Historical replay with synthetic data.</strong> The recall is a real, previously published RappelConso
          notice replayed for this demo, not a new alert. Kitchens, staff and deliveries are fictional.
        </p>
      </div>
    </div>
  );
}
