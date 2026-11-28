"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  AuthCard,
  EmailField,
  PasswordField,
} from "../../features/auth/auth-card";
import { useSession } from "../../features/auth/session-provider";

export default function RegisterPage() {
  const { register } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const message = await register(
      String(form.get("email")),
      String(form.get("password")),
    );
    setNotice(message);
  }
  return (
    <AuthCard
      title="Create your account"
      description="Start with a secure account. You’ll verify your email before signing in."
      onSubmit={submit}
      submitLabel="Create account"
      notice={notice}
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <EmailField />
      <PasswordField confirm />
    </AuthCard>
  );
}
