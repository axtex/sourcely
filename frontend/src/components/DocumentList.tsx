/**
 * DocumentList.tsx — Sidebar list of uploaded documents
 *
 * Fetches from GET /documents on mount (and whenever the parent bumps the key).
 *
 * Status polling (Day 2):
 *   After upload the server returns immediately with status="uploaded".
 *   This component detects any document in a transitional state (uploaded /
 *   processing) and starts polling GET /documents/{id}/status every 3 seconds.
 *   The interval is cleared automatically when all docs reach a terminal state
 *   (processed / failed) or when the component unmounts.
 */

import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Document {
  id: string;
  filename: string;
  file_size: number;
  status: "uploaded" | "processing" | "processed" | "failed";
  chunk_count: number;
  created_at: string;
  processed_at: string | null;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// Terminal states: no more polling needed once we reach these
const TERMINAL_STATUSES = new Set<Document["status"]>(["processed", "failed"]);

// Status badge colours
const STATUS_STYLES: Record<Document["status"], string> = {
  uploaded:   "bg-gray-100 text-gray-600",
  processing: "bg-yellow-100 text-yellow-700",
  processed:  "bg-green-100 text-green-700",
  failed:     "bg-red-100 text-red-600",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Small inline spinner shown next to in-progress badges */
function Spinner() {
  return (
    <svg
      className="inline-block w-3 h-3 ml-1 animate-spin text-yellow-600"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function DocumentList({ selectedId, onSelect }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDocs();
  }, []);

  async function fetchDocs() {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/documents`);
      setDocs(res.data);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Status polling ─────────────────────────────────────────────────────────
  //
  // Derive the set of IDs that still need polling from current docs state.
  // We stringify them into a stable key so the effect only re-runs when the
  // set actually changes (a new upload arrives or a doc reaches a terminal state).
  const transitionalIds = docs
    .filter((d) => !TERMINAL_STATUSES.has(d.status))
    .map((d) => d.id);
  const pollingKey = transitionalIds.join(",");

  useEffect(() => {
    if (transitionalIds.length === 0) return; // nothing to poll

    const interval = setInterval(async () => {
      // Poll all in-flight docs in parallel; each update is applied independently
      await Promise.all(
        transitionalIds.map(async (id) => {
          try {
            const res = await axios.get(`${API_BASE}/documents/${id}/status`);
            // Merge only the fields the status endpoint returns (status, chunk_count, processed_at)
            setDocs((prev) =>
              prev.map((d) => (d.id === id ? { ...d, ...res.data } : d))
            );
          } catch {
            // Silent — a transient network error doesn't need user feedback here
          }
        })
      );
    }, 3000);

    // Cleanup: clear interval when transitionalIds changes or component unmounts
    return () => clearInterval(interval);
  }, [pollingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(doc: Document, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;

    setDeletingId(doc.id);
    try {
      await axios.delete(`${API_BASE}/documents/${doc.id}`);
      if (selectedId === doc.id) onSelect(null);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete document. See console for details.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-4 py-6 text-center text-sm text-gray-400">
        Loading documents…
      </div>
    );
  }

  return (
    <div className="py-2">
      {/* "All documents" option */}
      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
          selectedId === null
            ? "bg-indigo-50 text-indigo-700 font-medium"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        All documents
      </button>

      {docs.length > 0 && <div className="mx-4 my-1 border-t border-gray-100" />}

      {docs.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400 text-center">
          No documents yet — upload a PDF above.
        </p>
      ) : (
        docs.map((doc) => {
          const isTransitional = !TERMINAL_STATUSES.has(doc.status);
          // Only processed docs can be meaningfully queried
          const isSelectable = doc.status === "processed";

          return (
            <div
              key={doc.id}
              onClick={() => isSelectable && onSelect(doc.id)}
              className={`group relative px-4 py-3 transition-colors border-l-2 ${
                selectedId === doc.id
                  ? "bg-indigo-50 border-indigo-500"
                  : isSelectable
                  ? "cursor-pointer hover:bg-gray-50 border-transparent"
                  : "cursor-default border-transparent opacity-80"
              }`}
            >
              {/* Filename */}
              <p className="text-sm text-gray-800 font-medium truncate pr-6" title={doc.filename}>
                {doc.filename}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Status badge + spinner */}
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                    STATUS_STYLES[doc.status]
                  }`}
                >
                  {doc.status}
                  {/* Spinner only while actively processing (not just "uploaded") */}
                  {isTransitional && <Spinner />}
                </span>

                {/* Chunk count — only shown after processing */}
                {doc.status === "processed" && (
                  <span className="text-[11px] text-gray-400">
                    {doc.chunk_count} chunks
                  </span>
                )}

                {/* File size */}
                <span className="text-[11px] text-gray-400">{formatBytes(doc.file_size ?? 0)}</span>

                {/* Upload date */}
                <span className="text-[11px] text-gray-400">{formatDate(doc.created_at)}</span>
              </div>

              {/* Delete button — appears on hover */}
              <button
                onClick={(e) => handleDelete(doc, e)}
                disabled={deletingId === doc.id}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                title="Delete document"
              >
                {deletingId === doc.id ? (
                  <span className="text-xs">…</span>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
