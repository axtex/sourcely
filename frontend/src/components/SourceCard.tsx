/**
 * SourceCard.tsx — Displays one cited source passage
 *
 * Dark surface treatment (--dark-surface / --dark-text) makes source
 * passages read like code blocks — intentional, since they're verbatim
 * quoted text from the document rather than generated prose.
 *
 * Long content is truncated with a "Show more" toggle (> 280 chars).
 * Similarity score is shown in mono at the top metadata bar.
 */

import { useState } from "react";

interface Source {
  content: string;
  similarity: number;
  chunk_index: number;
  page_number: number | null;
  document_id: string;
}

interface Props {
  source: Source;
  index: number; // citation number [1], [2], etc.
}

const PREVIEW_LENGTH = 280;

export default function SourceCard({ source, index }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isLong = source.content.length > PREVIEW_LENGTH;
  const displayText =
    !isLong || expanded
      ? source.content
      : source.content.slice(0, PREVIEW_LENGTH) + "…";

  const similarityPct = Math.round(source.similarity * 100);

  return (
    <div
      style={{
        background: "var(--dark-surface)",
        borderRadius: "6px",
        padding: "12px 14px",
        fontSize: "12px",
      }}
    >
      {/* Metadata bar: citation number · page · similarity */}
      <div
        className="font-mono flex items-center gap-3"
        style={{
          fontSize: "10px",
          color: "var(--muted)",
          marginBottom: "8px",
        }}
      >
        {/* Citation number */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "18px",
            height: "18px",
            borderRadius: "3px",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--dark-text)",
            fontSize: "10px",
            flexShrink: 0,
          }}
        >
          {index}
        </span>

        {source.page_number != null && (
          <span>p. {source.page_number}</span>
        )}

        {/* Similarity colour: green ≥ 80, amber 60–79, muted otherwise */}
        <span
          style={{
            color:
              similarityPct >= 80
                ? "#4ade80"
                : similarityPct >= 60
                ? "#fbbf24"
                : "var(--muted)",
          }}
        >
          {similarityPct}% match
        </span>
      </div>

      {/* Passage text — mono, warm light on dark */}
      <p
        className="font-mono"
        style={{
          color: "var(--dark-text)",
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}
      >
        {displayText}
      </p>

      {/* Show more / less toggle */}
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono"
          style={{
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
            textDecorationStyle: "dotted",
          }}
        >
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}
