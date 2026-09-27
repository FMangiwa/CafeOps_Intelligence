"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_STARTED_KEY = "cafeops_session_started_at";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function resolveEntryRoute() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      const storedStartedAt = window.sessionStorage.getItem(SESSION_STARTED_KEY);
      const startedAt = storedStartedAt ? Number(storedStartedAt) : NaN;

      // Supabase can retain its auth session after the browser tab is closed.
      // CaféOps intentionally requires a fresh application session for a new tab/window.
      if (!Number.isFinite(startedAt)) {
        await supabase.auth.signOut();
        if (!cancelled) router.replace("/login");
        return;
      }

      if (Date.now() - startedAt >= SESSION_MAX_AGE_MS) {
        window.sessionStorage.removeItem(SESSION_STARTED_KEY);
        await supabase.auth.signOut();
        if (!cancelled) router.replace("/login?expired=1");
        return;
      }

      router.replace("/overview");
    }

    void resolveEntryRoute();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
