"use client";

import { useActionState, type ReactNode } from "react";

import type { ActionState } from "@/app/actions";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const VARIANTS = {
  primary: "bg-forest text-paper hover:bg-forest-deep",
  secondary: "bg-card text-ink border border-ink hover:bg-forest-soft",
  danger: "bg-card text-tomato border border-tomato hover:bg-tomato-soft",
};

const SIZES = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "w-full justify-center px-4 py-3 text-base sm:w-auto",
};

export function ActionForm({ action, submitLabel, pendingLabel, children, variant = "primary", size = "md", className }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-sm font-semibold transition-colors duration-100 disabled:opacity-60 ${SIZES[size]} ${VARIANTS[variant]}`}
        >
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
        {state?.error && (
          <p role="alert" className="inline-flex items-center gap-1 text-sm text-tomato">
            <span aria-hidden className="font-semibold">×</span> {state.error}
          </p>
        )}
        {state?.ok && !pending && (
          <p role="status" className="inline-flex items-center gap-1 text-sm text-ink">
            <span aria-hidden className="font-semibold text-forest">✓</span> {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
