"use client";

import Link from "next/link";
import { FormEvent } from "react";
import {
  AuthCard,
  EmailField,
  PasswordField,
} from "../../features/auth/auth-card";
import { useSession } from "../../features/auth/session-provider";

export default function LoginPage() {
  const { login } = useSession();
  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await login(String(form.get("email")), String(form.get("password")));
  }
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue to your inventory workspace."
      onSubmit={submit}
      submitLabel="Sign in"
      footer={
        <>
          New to Stockroom? <Link href="/register">Create an account</Link>
          <br />
          <Link href="/forgot-password">Forgot your password?</Link>
        </>
      }
    >
      <EmailField />
      <PasswordField />
    </AuthCard>
  );
}
