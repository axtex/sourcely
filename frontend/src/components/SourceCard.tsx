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
  index: number;
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

  const matchColor =
    similarityPct >= 80
      ? "var(--match-high)"
      : similarityPct >= 60
      ? "var(--match-mid)"
      : "var(--dark-text)";

  return (
    <div
      style={{
        background: "var(--dark-surface)",
        borderRadius: "6px",
        padding: "12px 14px",
        fontSize: "12px",
      }}
    >
      <div
        className="font-mono flex items-center gap-3"
        style={{
          fontSize: "10px",
          color: "var(--dark-text)",
          opacity: 0.65,
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "18px",
            height: "18px",
            borderRadius: "3px",
            border: "1px solid var(--dark-border)",
            color: "var(--dark-text)",
            fontSize: "10px",
            flexShrink: 0,
            opacity: 1,
          }}
        >
          {index}
        </span>

        {source.page_number != null && (
          <span style={{ opacity: 1 }}>p. {source.page_number}</span>
        )}

        <span style={{ color: matchColor, opacity: 1 }}>
          {similarityPct}% match
        </span>
      </div>

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

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-mono interactive-btn"
          style={{
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--dark-text)",
            opacity: 0.65,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            fontFamily: "inherit",
          }}
        >
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}
