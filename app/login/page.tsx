import { ActionForm } from "@/components/action-form";
import { ReplayBanner } from "@/components/banner";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <>
      <ReplayBanner />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">L</span>
            <h1 className="text-xl font-semibold tracking-tight">Lotara</h1>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            See which of your kitchens received a recalled batch, and what to do next. Manager sign-in (demo).
          </p>
          <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in…" className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Demo password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
              />
            </label>
          </ActionForm>
        </div>
      </main>
    </>
  );
}
