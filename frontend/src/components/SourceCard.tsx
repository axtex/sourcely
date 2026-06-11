/**
 * SourceCard.tsx — Displays one cited source passage
 *
 * Shows the page number, similarity score, and a preview of the text.
 * Long content is truncated with a "Show more" toggle to keep the UI clean.
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

const PREVIEW_LENGTH = 200; // characters before "Show more"

export default function SourceCard({ source, index }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isLong = source.content.length > PREVIEW_LENGTH;
  const displayText =
    !isLong || expanded
      ? source.content
      : source.content.slice(0, PREVIEW_LENGTH) + "…";

  const similarityPct = Math.round(source.similarity * 100);

  // Colour the similarity score: green > 80%, yellow 60–80%, gray below
  const simColour =
    similarityPct >= 80
      ? "text-green-600"
      : similarityPct >= 60
      ? "text-yellow-600"
      : "text-gray-500";

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2">
          {/* Citation number */}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex-shrink-0">
            {index}
          </span>

          {/* Page number */}
          {source.page_number != null && (
            <span className="text-xs text-gray-500">Page {source.page_number}</span>
          )}
        </div>

        {/* Similarity score */}
        <span className={`text-xs font-medium ${simColour}`}>
          {similarityPct}% match
        </span>
      </div>

      {/* Content */}
      <p className="text-gray-700 leading-relaxed text-xs">{displayText}</p>

      {/* Show more / less toggle */}
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs text-indigo-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
