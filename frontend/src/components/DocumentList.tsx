/**
 * DocumentList.tsx — Sidebar list of uploaded documents
 *
 * Fetches from GET /documents on mount (and whenever the parent bumps the key).
 *
 * Status polling:
 *   After upload the server returns status="uploaded". This component detects
 *   any document in a transitional state (uploaded / processing) and polls
 *   GET /documents/{id}/status every 3 seconds. The interval is cleared
 *   automatically when all docs reach a terminal state (processed / failed)
 *   or when the component unmounts.
 *
 * Loading state: shimmer skeleton rows while the initial fetch is in-flight.
 * Empty state: instructional placeholder when no documents exist yet.
 */

import { useEffect, useState } from "react";
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

const TERMINAL_STATUSES = new Set<Document["status"]>(["processed", "failed"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Small status indicator dot with colour + optional pulse for in-progress states */
function StatusDot({ status }: { status: Document["status"] }) {
  const color =
    status === "processed"
      ? "#16a34a"
      : status === "processing" || status === "uploaded"
      ? "#d97706"
      : "#dc2626";

  const pulse = status === "processing" || status === "uploaded";

  return (
    <span
      className={pulse ? "animate-pulse-dot" : ""}
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

/** Shimmer skeleton rows shown while loading */
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
  const transitionalIds = docs
    .filter((d) => !TERMINAL_STATUSES.has(d.status))
    .map((d) => d.id);
  const pollingKey = transitionalIds.join(",");

  useEffect(() => {
    if (transitionalIds.length === 0) return;

    const interval = setInterval(async () => {
      await Promise.all(
        transitionalIds.map(async (id) => {
          try {
            const res = await axios.get(`${API_BASE}/documents/${id}/status`);
            setDocs((prev) =>
              prev.map((d) => (d.id === id ? { ...d, ...res.data } : d))
            );
          } catch {
            // silent — transient network errors don't need user feedback here
          }
        })
      );
    }, 3000);

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
      <>
        <SectionLabel />
        <SkeletonList />
      </>
    );
  }

  return (
    <div>
      <SectionLabel />

      {/* "All documents" entry */}
      <button
        onClick={() => onSelect(null)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          background: selectedId === null ? "var(--surface)" : "transparent",
          color: selectedId === null ? "var(--fg)" : "var(--muted)",
          border: "none",
          cursor: "pointer",
          transition: "background 0.1s",
          fontFamily: "inherit",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        All documents
      </button>

      {/* Divider */}
      {docs.length > 0 && (
        <div style={{ margin: "2px 16px", height: "1px", background: "var(--border)" }} />
      )}

      {/* Empty state */}
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

      {/* Document rows */}
      {docs.map((doc) => {
        const isSelectable = doc.status === "processed";
        const isSelected = selectedId === doc.id;
        const isHovered = hoveredId === doc.id;

        return (
          <div
            key={doc.id}
            onClick={() => isSelectable && onSelect(doc.id)}
            onMouseEnter={() => setHoveredId(doc.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position: "relative",
              padding: "10px 16px",
              cursor: isSelectable ? "pointer" : "default",
              borderLeft: `2px solid ${isSelected ? "var(--fg)" : "transparent"}`,
              background: isSelected ? "var(--surface)" : isHovered && isSelectable ? "var(--surface)" : "transparent",
              transition: "background 0.1s, border-color 0.1s",
              opacity: !isSelectable && doc.status !== "uploaded" && doc.status !== "processing" ? 0.5 : 1,
            }}
          >
            {/* Filename */}
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--fg)", paddingRight: "20px", marginBottom: "4px" }}
              title={doc.filename}
            >
              {doc.filename}
            </p>

            {/* Meta row */}
            <div
              className="flex items-center gap-2 font-mono flex-wrap"
              style={{ fontSize: "10px", color: "var(--muted)" }}
            >
              {/* Status dot + label */}
              <span className="flex items-center gap-1">
                <StatusDot status={doc.status} />
                <span>{doc.status}</span>
              </span>

              {/* Chunk count — only after processing */}
              {doc.status === "processed" && (
                <span>{doc.chunk_count} chunks</span>
              )}

              <span>{formatBytes(doc.file_size ?? 0)}</span>
              <span>{formatDate(doc.created_at)}</span>
            </div>

            {/* Delete button — appears on hover */}
            <button
              onClick={(e) => handleDelete(doc, e)}
              disabled={deletingId === doc.id}
              title="Delete document"
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                opacity: isHovered ? 1 : 0,
                transition: "opacity 0.15s",
                padding: "3px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--muted)",
                lineHeight: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
            >
              {deletingId === doc.id ? (
                <span style={{ fontSize: "11px" }}>…</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** "DOCUMENTS" section header — all-caps mono label */
function SectionLabel() {
  return (
    <p
      className="font-mono uppercase"
      style={{
        fontSize: "9px",
        letterSpacing: "0.14em",
        color: "var(--muted)",
        padding: "12px 16px 6px",
      }}
    >
      Documents
    </p>
  );
}
