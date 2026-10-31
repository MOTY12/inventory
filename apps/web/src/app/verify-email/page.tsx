"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "../../features/auth/auth-card";
import { useSession } from "../../features/auth/session-provider";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<main className="auth-loading">Loading verification…</main>}
    >
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const { verifyEmail } = useSession();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  async function submit() {
    setNotice(await verifyEmail(token));
  }
  return (
    <AuthCard
      title="Verify your email"
      description="Confirm the address associated with your account."
      onSubmit={submit}
      submitLabel="Verify email"
      notice={notice}
      footer={<Link href="/login">Return to sign in</Link>}
    >
      <label className="auth-field">
        Verification token
        <input
          autoComplete="one-time-code"
          name="token"
          onChange={(event) => setToken(event.target.value)}
          required
          value={token}
        />
      </label>
    </AuthCard>
  );
}
