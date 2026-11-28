"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard, PasswordField } from "../../features/auth/auth-card";
import { useSession } from "../../features/auth/session-provider";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<main className="auth-loading">Loading reset form…</main>}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const { resetPassword } = useSession();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    setNotice(
      await resetPassword(
        token,
        String(new FormData(event.currentTarget).get("password")),
      ),
    );
  }
  return (
    <AuthCard
      title="Choose a new password"
      description="Reset links can only be used once."
      onSubmit={submit}
      submitLabel="Update password"
      notice={notice}
      footer={<Link href="/login">Return to sign in</Link>}
    >
      <label className="auth-field">
        Reset token
        <input
          name="token"
          onChange={(event) => setToken(event.target.value)}
          required
          value={token}
        />
      </label>
      <PasswordField confirm />
    </AuthCard>
  );
}
