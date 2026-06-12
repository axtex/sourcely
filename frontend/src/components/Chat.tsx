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

import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
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
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  isError?: boolean;
}

interface Props {
  selectedDocumentId: string | null;
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `msg-${messageCounter}-${Date.now()}`;
}

/** Typing indicator: three dots with staggered ease-out pulse */
function TypingDots() {
  return (
    <div
      className="typing-dots"
      style={{ display: "flex", gap: "5px", alignItems: "center", padding: "2px 0" }}
      aria-label="Waiting for answer"
      role="status"
    >
      {[0, 180, 360].map((delay, i) => (
        <span key={i} className="typing-dot" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </div>
  );
}

export default function Chat({ selectedDocumentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputLabelId = useId();

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: prefersReduced ? "instant" : "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    setMessages([]);
    setExpandedSources(new Set());
  }, [selectedDocumentId]);

  function toggleSources(messageId: string) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      next.has(messageId) ? next.delete(messageId) : next.add(messageId);
      return next;
    });
  }

  async function submit() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await axios.post(`${API_BASE}/query`, {
        question,
        document_id: selectedDocumentId ?? undefined,
        top_k: 5,
      });

      const { answer, sources } = res.data;
      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), question, answer, sources },
      ]);
    } catch (err: unknown) {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? err.response.data.detail
          : "Failed to get an answer. Check server logs.";
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          question,
          answer: detail,
          sources: [],
          isError: true,
        },
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

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div
        className="px-4 lg:px-6"
        style={{
          paddingTop: "8px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <p className="section-label">
          {selectedDocumentId ? "Selected document" : "All documents"}
        </p>
      </div>

      <div
        className="px-4 lg:px-6 py-6 lg:py-8 gap-7 lg:gap-8"
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && !loading && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
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

        {messages.map((msg) => {
          const sourcesExpanded = expandedSources.has(msg.id);
          const sourcesPanelId = `sources-${msg.id}`;

          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  className="chat-bubble-user text-sm"
                  style={{
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

              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div className="chat-bubble-answer" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {msg.isError ? (
                    <p className="error-banner" role="alert">
                      {msg.answer}
                    </p>
                  ) : (
                    <p
                      className="text-sm"
                      style={{ color: "var(--fg)", lineHeight: 1.7, margin: 0 }}
                    >
                      {msg.answer}
                    </p>
                  )}

                  {msg.sources.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleSources(msg.id)}
                        className="font-mono touch-target interactive-btn"
                        aria-expanded={sourcesExpanded}
                        aria-controls={sourcesPanelId}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "11px",
                          color: "var(--muted)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "0 8px",
                          letterSpacing: "0.03em",
                          marginLeft: "-8px",
                          fontFamily: "inherit",
                        }}
                      >
                        <svg
                          width="10" height="10"
                          viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          className="sources-chevron"
                          style={{
                            transform: sourcesExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            flexShrink: 0,
                          }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        {sourcesExpanded ? "hide" : "show"} {msg.sources.length} source
                        {msg.sources.length !== 1 ? "s" : ""}
                      </button>

                      {sourcesExpanded && (
                        <div
                          id={sourcesPanelId}
                          style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}
                        >
                          {msg.sources.map((source, si) => (
                            <SourceCard
                              key={`${source.document_id}-${source.chunk_index}`}
                              source={source}
                              index={si + 1}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          );
        })}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <TypingDots />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        className="px-3 sm:px-4"
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: "12px",
          paddingBottom: "12px",
          flexShrink: 0,
        }}
      >
        <label id={inputLabelId} className="sr-only">
          Ask a question
        </label>
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send)"
            rows={1}
            disabled={loading}
            aria-labelledby={inputLabelId}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--fg)",
              fontFamily: "inherit",
              minHeight: "24px",
              maxHeight: "128px",
              lineHeight: 1.5,
              padding: 0,
              textAlign: "left",
            }}
          />

          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="touch-target interactive-btn"
            style={{
              border: "none",
              background: "transparent",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              color: input.trim() && !loading ? "var(--fg)" : "var(--disabled)",
              lineHeight: 0,
              transition: "color 0.15s var(--ease-out)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        <p
          className="font-mono section-label"
          style={{ textAlign: "right", marginTop: "6px", textTransform: "none", letterSpacing: "0.02em" }}
        >
          shift+enter for newline
        </p>
      </div>

    </div>
  );
}
