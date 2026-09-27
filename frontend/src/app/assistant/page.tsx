"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSelectedLocation } from "@/lib/location";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const START_DATE = "2026-08-01";
const END_DATE = "2026-08-31";

const suggestedQuestions = [
  "What were our sales and average order value?",
  "How much did labor cost during August?",
  "What is the theoretical gross profit?",
  "Which ingredients are below their reorder point?",
  "How much did we spend with vendors?",
];

export default function AssistantPage() {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Ask any business question about sales, labor, inventory, menu costs, profit, or vendors. I will retrieve the relevant data and explain the result.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLocationId(getSelectedLocation());
    setLocationReady(true);
  }, []);

  async function submitQuestion(event?: FormEvent) {
    event?.preventDefault();

    const question = message.trim();

    if (!question || loading) return;

    if (!locationId) {
      setError("Select a workspace location first.");
      return;
    }

    if (!API_BASE_URL) {
      setError("API base URL is not configured.");
      return;
    }

    setError("");
    setMessages((current) => [
      ...current,
      { role: "user", content: question },
    ]);
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/v1/assistant`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            message: question,
            location_id: locationId,
            start_date: START_DATE,
            end_date: END_DATE,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.detail ||
            `Assistant request failed (${response.status}).`,
        );
      }

      if (!payload?.answer) {
        throw new Error("The assistant returned an empty answer.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.answer },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reach CaféOps AI.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col p-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">
          CaféOps Intelligence
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Ask CaféOps AI
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask questions about the selected location and August 2026 demo data.
          Answers are grounded in read-only business data queries and approved calculations.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {locationReady
            ? locationId
              ? `Location: ${locationId}`
              : "No location selected"
            : "Loading location…"}
        </p>
      </header>

      <section className="mt-6 flex-1 rounded-xl border bg-card">
        <div className="max-h-[55vh] space-y-4 overflow-y-auto p-5">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`flex ${
                item.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  item.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {item.role === "assistant" ? (
                  <div className="space-y-2">
                    {item.content.split(/\n\s*\n/).map((block, blockIndex) => {
                      const lines = block.trim().split("\n").filter(Boolean);
                      return (
                        <div key={blockIndex}>
                          {lines.map((line, lineIndex) => {
                            const bold = line.match(/^\*\*(.+)\*\*$/);
                            if (bold) {
                              return (
                                <p
                                  key={lineIndex}
                                  className={lineIndex === 1 ? "text-2xl font-bold tracking-tight" : "font-semibold"}
                                >
                                  {bold[1]}
                                </p>
                              );
                            }
                            return (
                              <p key={lineIndex} className="text-muted-foreground">
                                {line.replace(/\*\*/g, "")}
                              </p>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{item.content}</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              CaféOps AI is checking the approved business data…
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mx-5 mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            {error}
          </div>
        )}

        <div className="border-t p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggested questions
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => setMessage(question)}
                disabled={loading || !locationId}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>

          <form onSubmit={submitQuestion} className="flex gap-3">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about sales, labor, inventory, costs, profit, or vendors…"
              rows={3}
              maxLength={4000}
              disabled={loading || !locationId}
              className="min-h-[84px] flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2"
            />

            <button
              type="submit"
              disabled={loading || !message.trim() || !locationId}
              className="self-end rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Asking…" : "Ask"}
            </button>
          </form>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Read-only demo assistant. Numeric answers are grounded in tool
            results. Inventory values are theoretical unless a physical count
            exists; profit is not net profit.
          </p>
        </div>
      </section>
    </main>
  );
}
