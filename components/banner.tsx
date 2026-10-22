
/** Slim, persistent reminder that this is a replay with fictional data. */
export function ReplayBanner() {
  return (
    <div className="border-b border-ochre/40 bg-ochre-soft px-4 py-1.5 text-xs text-ochre">
      <div className="mx-auto flex max-w-6xl items-start gap-2 sm:items-center">
                <p>
          <strong className="font-semibold">Historical replay with synthetic data.</strong> The recall is a real,
          previously published RappelConso notice replayed for this demo, not a new alert. Kitchens, staff and
          deliveries are fictional.
        </p>
      </div>
    </div>
  );
}
