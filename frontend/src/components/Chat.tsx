/**
 * Chat.tsx — Q&A chat interface
 *
 * Maintains a list of {question, answer, sources} turns.
 * Each answer can expand its cited sources section.
 * Enter submits, Shift+Enter adds a newline.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import axios from "axios";
import SourceCard from "./SourceCard";

const API_BASE = "http://localhost:8000";

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

export default function Chat({ selectedDocumentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Reset chat when the user switches documents
  // (old answers from a different document would be confusing)
  useEffect(() => {
    setMessages([]);
    setExpandedSources(new Set());
  }, [selectedDocumentId]);

  function toggleSources(index: number) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function submit() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setLoading(true);

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

  return (
    <div className="flex flex-col h-full">
      {/* ── Chat header ── */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Chat</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedDocumentId
              ? "Asking about selected document"
              : "Searching all documents"}
          </p>
        </div>
      </div>

      {/* ── Message history ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 pt-16">
            <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Upload a PDF and ask a question</p>
            <p className="text-xs mt-1 text-gray-400">
              Answers will include cited passages from the document
            </p>
          </div>
        )}

        {/* Message turns */}
        {messages.map((msg, i) => (
          <div key={i} className="space-y-3">
            {/* Question bubble */}
            <div className="flex justify-end">
              <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
                {msg.question}
              </div>
            </div>

            {/* Answer bubble */}
            <div className="flex justify-start">
              <div className="max-w-[85%] space-y-2">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed">
                  {msg.answer}
                </div>

                {/* Sources toggle */}
                {msg.sources.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleSources(i)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${expandedSources.has(i) ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {expandedSources.has(i) ? "Hide" : "Show"} {msg.sources.length} source
                      {msg.sources.length !== 1 ? "s" : ""}
                    </button>

                    {/* Source cards */}
                    {expandedSources.has(i) && (
                      <div className="mt-2 space-y-2">
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

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 transition">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents… (Enter to send)"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none min-h-[20px] max-h-32"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={submit}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
            title="Send (Enter)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1 text-right">
          Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
