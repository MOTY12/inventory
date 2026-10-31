"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthCard, EmailField } from "../../features/auth/auth-card";
import { useSession } from "../../features/auth/session-provider";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    setNotice(
      await forgotPassword(
        String(new FormData(event.currentTarget).get("email")),
      ),
    );
  }
  return (
    <AuthCard
      title="Reset your password"
      description="If your account exists, we’ll send a reset link."
      onSubmit={submit}
      submitLabel="Send reset link"
      notice={notice}
      footer={<Link href="/login">Return to sign in</Link>}
    >
      <EmailField />
    </AuthCard>
  );
}
