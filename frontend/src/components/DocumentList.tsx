/**
 * DocumentList.tsx — Sidebar list of uploaded documents
 *
 * Fetches from GET /documents on mount (and whenever the parent bumps the key).
 *
 * Status polling uses exponential backoff (3s → 10s max) while docs process.
 * Delete uses inline confirmation (no native confirm/alert dialogs).
 */

import { useEffect, useState, useRef } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const POLL_INITIAL_MS = 3000;
const POLL_MAX_MS = 10000;

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

const TERMINAL_STATUSES = new Set<Document["status"]>(["processed", "failed"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: Document["status"] }) {
  const color =
    status === "processed"
      ? "var(--success)"
      : status === "processing" || status === "uploaded"
      ? "var(--warning)"
      : "var(--error)";

  const pulse = status === "processing" || status === "uploaded";

  return (
    <span
      className={pulse ? "animate-pulse-dot" : ""}
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function SkeletonList() {
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {[80, 60, 72].map((w, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div className="skeleton" style={{ height: "11px", width: `${w}%` }} />
          <div className="skeleton" style={{ height: "9px", width: "40%" }} />
        </div>
      ))}
    </div>
  );
}

export default function DocumentList({ selectedId, onSelect }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pollDelayRef = useRef(POLL_INITIAL_MS);

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

  const transitionalIds = docs
    .filter((d) => !TERMINAL_STATUSES.has(d.status))
    .map((d) => d.id);
  const pollingKey = transitionalIds.join(",");

  useEffect(() => {
    if (transitionalIds.length === 0) return;

    pollDelayRef.current = POLL_INITIAL_MS;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;

      await Promise.all(
        transitionalIds.map(async (id) => {
          try {
            const res = await axios.get(`${API_BASE}/documents/${id}/status`);
            setDocs((prev) =>
              prev.map((d) => (d.id === id ? { ...d, ...res.data } : d))
            );
          } catch {
            // transient network errors: skip user feedback, retry on next tick
          }
        })
      );

      if (cancelled) return;
      timeoutId = setTimeout(tick, pollDelayRef.current);
      pollDelayRef.current = Math.min(
        Math.round(pollDelayRef.current * 1.5),
        POLL_MAX_MS
      );
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pollingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function requestDelete(doc: Document, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteError(null);
    setConfirmingId(doc.id);
  }

  function cancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingId(null);
  }

  async function confirmDelete(doc: Document, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingId(null);
    setDeletingId(doc.id);
    setDeleteError(null);

    try {
      await axios.delete(`${API_BASE}/documents/${doc.id}`);
      if (selectedId === doc.id) onSelect(null);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleteError(`Could not delete "${doc.filename}". Try again.`);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <>
        <SectionLabel />
        <SkeletonList />
      </>
    );
  }

  return (
    <div role="region" aria-label="Documents">
      <SectionLabel />

      {deleteError && (
        <p className="error-banner text-xs" role="alert" style={{ margin: "8px 16px 0" }}>
          {deleteError}
        </p>
      )}

      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selectedId === null}
        className={`interactive-btn w-full text-left${selectedId === null ? " doc-row-selected" : ""}`}
        style={{
          padding: "12px 16px",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          background: selectedId === null ? "var(--surface)" : "transparent",
          color: selectedId === null ? "var(--fg)" : "var(--muted)",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontWeight: selectedId === null ? 500 : 400,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        All documents
      </button>

      {docs.length > 0 && (
        <div style={{ margin: "2px 16px", height: "1px", background: "var(--border)" }} />
      )}

      {docs.length === 0 && (
        <p
          className="text-xs text-center"
          style={{ padding: "24px 16px", color: "var(--muted)", lineHeight: 1.6 }}
        >
          No documents yet.
          <br />
          Upload a PDF above.
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {docs.map((doc) => {
          const isSelectable = doc.status === "processed";
          const isSelected = selectedId === doc.id;
          const isHovered = hoveredId === doc.id;
          const isConfirming = confirmingId === doc.id;

          const rowContent = (
            <>
              <p
                className={`doc-filename text-sm truncate${isSelected ? " font-semibold" : " font-medium"}`}
                style={{ color: "var(--fg)", paddingRight: isConfirming ? 0 : "44px", marginBottom: "4px", marginTop: 0 }}
                title={doc.filename}
              >
                {doc.filename}
              </p>

              {isConfirming ? (
                <div
                  className="flex items-center gap-2 flex-wrap"
                  style={{ fontSize: "11px" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ color: "var(--muted)" }}>Delete this file?</span>
                  <button
                    type="button"
                    onClick={(e) => confirmDelete(doc, e)}
                    className="interactive-btn font-mono"
                    style={{
                      padding: "4px 8px",
                      fontSize: "10px",
                      color: "var(--error)",
                      background: "transparent",
                      border: "1px solid var(--error)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="interactive-btn font-mono"
                    style={{
                      padding: "4px 8px",
                      fontSize: "10px",
                      color: "var(--muted)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 font-mono flex-wrap"
                  style={{ fontSize: "10px", color: "var(--muted)" }}
                >
                  <span className="flex items-center gap-1">
                    <StatusDot status={doc.status} />
                    <span>{doc.status}</span>
                  </span>
                  {doc.status === "processed" && <span>{doc.chunk_count} chunks</span>}
                  <span>{formatBytes(doc.file_size ?? 0)}</span>
                  <span>{formatDate(doc.created_at)}</span>
                </div>
              )}
            </>
          );

          const rowStyle = {
            position: "relative" as const,
            padding: "10px 16px",
            minHeight: "44px",
            width: "100%",
            textAlign: "left" as const,
            cursor: isSelectable ? "pointer" : "default",
            background: isSelected || (isHovered && isSelectable) ? "var(--surface)" : "transparent",
            transition: "background 0.15s var(--ease-out)",
            opacity: !isSelectable && doc.status !== "uploaded" && doc.status !== "processing" ? 0.5 : 1,
            border: "none",
            fontFamily: "inherit",
          };

          return (
            <li key={doc.id}>
              <div
                className={["doc-row", isSelected ? "doc-row-selected" : ""].filter(Boolean).join(" ")}
                onMouseEnter={() => setHoveredId(doc.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ ...rowStyle, display: "block" }}
              >
                {isSelectable && !isConfirming ? (
                  <button
                    type="button"
                    className="interactive-btn w-full text-left"
                    onClick={() => onSelect(doc.id)}
                    aria-pressed={isSelected}
                    disabled={!!deletingId}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      width: "100%",
                    }}
                  >
                    {rowContent}
                  </button>
                ) : (
                  rowContent
                )}

                {isSelectable && !isConfirming && (
                  <span
                    className="doc-delete-btn touch-target"
                    style={{ position: "absolute", top: "4px", right: "4px" }}
                  >
                    <button
                      type="button"
                      onClick={(e) => requestDelete(doc, e)}
                      disabled={deletingId === doc.id}
                      aria-label={`Delete ${doc.filename}`}
                      className="touch-target interactive-btn"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: isHovered ? "var(--error)" : "var(--muted)",
                        lineHeight: 0,
                        padding: 0,
                      }}
                    >
                      {deletingId === doc.id ? (
                        <span style={{ fontSize: "11px" }}>…</span>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionLabel() {
  return (
    <p className="section-label" style={{ padding: "12px 16px 6px" }}>
      Documents
    </p>
  );
}
