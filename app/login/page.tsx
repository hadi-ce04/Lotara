import { ActionForm } from "@/components/action-form";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <h1 className="text-2xl font-semibold">Lotara</h1>
      <p className="mt-1 text-sm text-slate-600">Recall response workspace (demo). Manager sign-in.</p>
      <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in…" className="mt-6 space-y-3">
        <label className="block text-sm font-medium">
          Demo password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </ActionForm>
    </main>
  );
}
