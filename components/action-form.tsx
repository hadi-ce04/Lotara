"use client";

import { useActionState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { ActionState } from "@/app/actions";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
};

const VARIANTS = {
  primary: "bg-slate-900 text-white hover:bg-slate-700",
  secondary: "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50",
  danger: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
};

export function ActionForm({ action, submitLabel, pendingLabel, children, variant = "primary", className }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${VARIANTS[variant]}`}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? (pendingLabel ?? "Working…") : submitLabel}
        </button>
        {state?.error && (
          <p role="alert" className="inline-flex items-center gap-1 text-sm text-red-700">
            <AlertTriangle className="size-4" aria-hidden /> {state.error}
          </p>
        )}
        {state?.ok && !pending && (
          <p role="status" className="inline-flex items-center gap-1 text-sm text-slate-700">
            <CheckCircle2 className="size-4" aria-hidden /> {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
