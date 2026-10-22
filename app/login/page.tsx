import { ActionForm } from "@/components/action-form";
import { ReplayBanner } from "@/components/banner";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <>
      <ReplayBanner />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <div className="rounded-sm border border-rule bg-card p-6">
          <div className="flex items-center gap-2">
            
            <h1 className="font-display text-4xl font-semibold tracking-tight [font-variation-settings:'opsz'_144]">Lotara</h1>
          </div>
          <p className="mt-3 text-sm text-muted">
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
                className="mt-1 block w-full rounded-sm border border-rule-strong px-3 py-2.5"
              />
            </label>
          </ActionForm>
        </div>
      </main>
    </>
  );
}
