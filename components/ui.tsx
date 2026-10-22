import type { ReactNode } from "react";

/** Masthead (outside <main>, so it never collides with the page header). */
export function TopBar({ children, width = "max-w-6xl" }: { children?: ReactNode; width?: string }) {
  return (
    <div className="border-b-2 border-ink bg-paper">
      <div className={`mx-auto flex ${width} items-end justify-between gap-3 px-4 pt-3 pb-2`}>
        <span className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold leading-none tracking-tight text-ink [font-variation-settings:'opsz'_72]">Lotara</span>
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">Recall response · nursery kitchens</span>
        </span>
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`border-b border-rule-strong pb-1.5 font-display text-xl font-semibold tracking-tight text-ink [font-variation-settings:'opsz'_36] ${className}`}>
      {children}
    </h2>
  );
}

export function Card({ title, children, className = "", id, aside }: { title?: ReactNode; children: ReactNode; className?: string; id?: string; aside?: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-4 rounded-sm border border-rule bg-card p-5 sm:p-6 ${className}`}>
      {title && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-rule-strong pb-1.5">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink [font-variation-settings:'opsz'_36]">{title}</h2>
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
    <details open={open} className="group rounded-sm border border-rule bg-card">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 px-5 py-4 transition-colors duration-100 hover:bg-paper [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="w-3 shrink-0 font-mono text-sm text-muted group-open:hidden">+</span>
        <span aria-hidden className="hidden w-3 shrink-0 font-mono text-sm text-muted group-open:inline">&minus;</span>
        <span className="font-display text-lg font-semibold text-ink">{title}</span>
        {meta && <span className="ml-auto text-right font-mono text-xs tabular-nums text-muted">{meta}</span>}
      </summary>
      <div className="border-t border-rule px-5 py-4">{children}</div>
    </details>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</p>;
}

export function Fine({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-relaxed text-muted ${className}`}>{children}</p>;
}

/** Thin ruled box for codes, like the print on a food label. */
export function Code({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <span className={`inline-block rounded-[2px] border border-rule-strong bg-card px-1.5 font-mono tabular-nums ${strong ? "font-semibold" : ""}`}>{children}</span>;
}

export function NotRecorded({ children = "not recorded" }: { children?: ReactNode }) {
  return <em className="font-sans text-ochre">{children}</em>;
}
