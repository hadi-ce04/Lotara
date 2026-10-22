import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** Top application bar (outside <main>, so it never collides with the page header). */
export function TopBar({ children, width = "max-w-6xl" }: { children?: ReactNode; width?: string }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-2.5`}>
        <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
          <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">L</span>
          Lotara
          <span className="hidden font-normal text-slate-500 sm:inline">· recall response</span>
        </span>
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, icon, children, className = "", id, aside }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; id?: string; aside?: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">{icon}{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Collapsible section for technical depth. Closed by default. */
export function Disclosure({ title, meta, children, open = false }: { title: ReactNode; meta?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" aria-hidden />
        <span className="font-semibold text-slate-900">{title}</span>
        {meta && <span className="ml-auto text-right text-xs text-slate-500">{meta}</span>}
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">{children}</div>
    </details>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

export function Fine({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-relaxed text-slate-500 ${className}`}>{children}</p>;
}

export function NotRecorded({ children = "not recorded" }: { children?: ReactNode }) {
  return <em className="font-sans text-amber-800">{children}</em>;
}
