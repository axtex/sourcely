/**
 * Chat.tsx — Q&A chat interface
 *
 * Message layout:
 *   User questions → right-aligned, dark bubble (--fg background)
 *   AI answers     → left-aligned, plain text on the page surface (no card border)
 *   Source passages → collapsed by default; expand into dark SourceCard blocks
 *
 * Enter submits, Shift+Enter adds a newline.
 * Input area is pinned to the bottom (flex-shrink-0).
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import axios from "axios";
import SourceCard from "./SourceCard";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Source {
  content: string;
  similarity: number;
  chunk_index: number;
  page_number: number | null;
  document_id: string;
}

interface Message {
  question: string;
  answer: string;
  sources: Source[];
}

interface Props {
  selectedDocumentId: string | null;
}

/** Animated typing indicator: three dots that bob in sequence */
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "2px 0" }}>
      {[0, 150, 300].map((delay, i) => (
        <span
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--muted)",
            display: "inline-block",
            animation: `bounce 1.2s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
      {/* Inline keyframes via a style tag would be cleaner, but Tailwind's
          animate-bounce works here: we use inline style for the delay only */}
    </div>
  );
}

export default function Chat({ selectedDocumentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clear chat when switching documents — stale answers would be misleading
  useEffect(() => {
    setMessages([]);
    setExpandedSources(new Set());
  }, [selectedDocumentId]);

  function toggleSources(index: number) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  async function submit() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setLoading(true);

    // Auto-shrink textarea after clearing
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await axios.post(`${API_BASE}/query`, {
        question,
        document_id: selectedDocumentId ?? undefined,
        top_k: 5,
      });

      const { answer, sources } = res.data;
      setMessages((prev) => [...prev, { question, answer, sources }]);
    } catch (err: unknown) {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? err.response.data.detail
          : "Failed to get an answer. Check server logs.";
      setMessages((prev) => [
        ...prev,
        { question, answer: `Error: ${detail}`, sources: [] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Auto-grow textarea as the user types
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Scope indicator ── */}
      <div
        style={{
          padding: "8px 24px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <p
          className="font-mono uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--muted)", margin: 0 }}
        >
          {selectedDocumentId ? "Selected document" : "All documents"}
        </p>
      </div>

      {/* ── Message history ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "32px",
        }}
      >
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "var(--muted)",
              gap: "8px",
              paddingBottom: "80px",
            }}
          >
            <p className="text-sm" style={{ color: "var(--fg)", fontWeight: 500, margin: 0 }}>
              Ask a question about your documents
            </p>
            <p className="text-xs" style={{ color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
              Upload a PDF first, then type your question below.
              <br />
              Answers include cited passages from the source.
            </p>
          </div>
        )}

        {/* Message turns */}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Question — right-aligned dark bubble */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div
                className="text-sm"
                style={{
                  maxWidth: "72%",
                  background: "var(--fg)",
                  color: "var(--dark-text)",
                  borderRadius: "12px 12px 3px 12px",
                  padding: "10px 14px",
                  lineHeight: 1.55,
                }}
              >
                {msg.question}
              </div>
            </div>

            {/* Answer — left-aligned, no card, just text */}
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", gap: "8px" }}>
                <p
                  className="text-sm"
                  style={{
                    color: "var(--fg)",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {msg.answer}
                </p>

                {/* Sources section */}
                {msg.sources.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleSources(i)}
                      className="font-mono"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "10px",
                        color: "var(--muted)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {/* Chevron rotates when expanded */}
                      <svg
                        width="10" height="10"
                        viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          transform: expandedSources.has(i) ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 0.15s",
                        }}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      {expandedSources.has(i) ? "hide" : "show"} {msg.sources.length} source
                      {msg.sources.length !== 1 ? "s" : ""}
                    </button>

                    {/* Dark source passage blocks */}
                    {expandedSources.has(i) && (
                      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {msg.sources.map((source, si) => (
                          <SourceCard key={si} source={source} index={si + 1} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        ))}

        {/* Typing indicator while waiting for a response */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <TypingDots />
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Pinned input area ── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px 12px",
            background: "var(--bg)",
            transition: "border-color 0.15s",
          }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--fg)")}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send)"
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: "14px",
              color: "var(--fg)",
              fontFamily: "inherit",
              minHeight: "20px",
              maxHeight: "128px",
              lineHeight: 1.5,
            }}
          />

          {/* Send button */}
          <button
            onClick={submit}
            disabled={!input.trim() || loading}
            title="Send (Enter)"
            style={{
              flexShrink: 0,
              padding: "4px",
              border: "none",
              background: "transparent",
              cursor: input.trim() && !loading ? "pointer" : "default",
              color: input.trim() && !loading ? "var(--fg)" : "var(--border)",
              lineHeight: 0,
              transition: "color 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        <p
          className="font-mono"
          style={{
            fontSize: "10px",
            color: "var(--muted)",
            textAlign: "right",
            marginTop: "4px",
            letterSpacing: "0.02em",
          }}
        >
          shift+enter for newline
        </p>
      </div>

    </div>
  );
}
