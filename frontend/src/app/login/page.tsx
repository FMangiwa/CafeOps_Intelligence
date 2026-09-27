
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const expired = new URLSearchParams(window.location.search).get("expired") === "1";
    if (expired) {
      setError("Your session expired. Please sign in again.");
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      sessionStorage.setItem("cafeops_session_started_at", String(Date.now()));
      router.push("/overview");
      router.refresh();
    } catch {
      setError("Unable to sign in. Check your configuration and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CaféOps</strong>
            <span>INTELLIGENCE</span>
          </div>
        </div>

        <p className="eyebrow">WORKSPACE ACCESS</p>
        <h1>Welcome back</h1>
        <p className="login-description">
          Sign in to access your café operations workspace.
        </p>

        <form className="login-form" onSubmit={handleLogin}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-footnote">
          Access is managed by your CaféOps workspace administrator.
        </p>
      </section>
    </main>
  );
}
