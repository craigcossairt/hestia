"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Sparkles } from "lucide-react";
import { Card, Body, Btn, Label, Mono } from "@/components/ds";
import { QUICK_ACTIONS } from "@/lib/ai/prompts/coach";
import { cn } from "@/lib/utils";

export function CoachChat() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/coach/chat" }),
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const sending = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (fd.get("prompt") as string | null)?.trim();
    if (!text || sending) return;
    sendMessage({ text });
    e.currentTarget.reset();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] max-h-[800px]">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4"
      >
        {empty ? (
          <Card className="p-6 flex flex-col gap-4 border-dashed">
            <div className="flex items-center gap-2">
              <Sparkles size={16} strokeWidth={1.5} />
              <Label>start a conversation</Label>
            </div>
            <Body size="sm" dim>
              Hestia knows your targets, recent meals, and what&apos;s in your
              inventory. Ask anything food-related.
            </Body>
          </Card>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}

        {sending ? (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 animate-pulse">
              Hestia is thinking…
            </span>
          </div>
        ) : null}

        {error ? (
          <Body size="sm" className="text-danger">
            {error.message}
          </Body>
        ) : null}
      </div>

      {/* Quick actions */}
      {empty ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.id}
              type="button"
              disabled={sending}
              onClick={() => sendMessage({ text: qa.prompt })}
              className="px-3 py-1.5 rounded-full font-sans text-[12px] border border-ink-l text-ink-2 hover:border-ink-3 hover:bg-paper-2 transition-colors disabled:opacity-50"
            >
              {qa.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-ink-l/50 pt-3"
      >
        <textarea
          name="prompt"
          rows={1}
          placeholder="Ask Hestia anything…"
          required
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="flex-1 px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
        />
        <Btn variant="primary" type="submit" disabled={sending}>
          <Send size={14} strokeWidth={1.5} />
          Send
        </Btn>
      </form>
    </div>
  );
}

interface UIMessageLike {
  id: string;
  role: string;
  parts?: Array<{ type: string; text?: string }>;
}

function Message({ message }: { message: UIMessageLike }) {
  const isUser = message.role === "user";
  const text = (message.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      {isUser ? (
        <div className="max-w-[85%] bg-ink text-paper rounded-card rounded-tr-sm px-4 py-2.5">
          <Body size="md" className="text-paper whitespace-pre-wrap">
            {text}
          </Body>
        </div>
      ) : (
        <Card className="max-w-[85%] px-4 py-3 flex flex-col gap-1.5 rounded-tl-sm">
          <div className="flex items-center gap-1.5">
            <Mono className="text-ink-3 text-[10px] uppercase tracking-wider">
              hestia
            </Mono>
          </div>
          <Body size="md" className="text-ink whitespace-pre-wrap">
            {text}
          </Body>
        </Card>
      )}
    </div>
  );
}
