/**
 * App.tsx — Root layout
 *
 * Top bar with the "sourcely" mono wordmark sits above a 35/65 split:
 *   Left  (35%): document management — upload + list
 *   Right (65%): chat interface
 *
 * selectedDocumentId flows down to both panels:
 *   - DocumentList highlights the selected doc
 *   - Chat filters results to that document (null = search all)
 */

import { useState } from "react";
import DocumentList from "./components/DocumentList";
import Upload from "./components/Upload";
import Chat from "./components/Chat";
import "./index.css";

export default function App() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  // Bump this counter to trigger a DocumentList re-fetch after upload
  const [refreshKey, setRefreshKey] = useState(0);

  function handleUploadSuccess() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col h-screen font-sans" style={{ background: "var(--bg)", color: "var(--fg)" }}>

      {/* ── Top bar ── */}
      <header
        className="flex items-center px-6 h-11 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Wordmark in mono — lowercase intentional, tool-like */}
        <span className="font-mono text-sm tracking-tight" style={{ color: "var(--fg)" }}>
          sourcely
        </span>
        <span
          className="ml-4 text-[10px] uppercase tracking-[0.14em] hidden sm:block"
          style={{ color: "var(--muted)" }}
        >
          document Q&amp;A
        </span>
      </header>

      {/* ── Split panels ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel — 35% */}
        <aside
          className="w-[35%] min-w-[260px] flex flex-col"
          style={{ borderRight: "1px solid var(--border)", background: "var(--bg)" }}
        >
          {/* Upload zone */}
          <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <Upload onSuccess={handleUploadSuccess} />
          </div>

          {/* Document list fills remaining space */}
          <div className="flex-1 overflow-y-auto">
            <DocumentList
              key={refreshKey}
              selectedId={selectedDocumentId}
              onSelect={setSelectedDocumentId}
            />
          </div>
        </aside>

        {/* Right panel — 65% */}
        <main className="flex-1 flex flex-col min-w-0" style={{ background: "var(--bg)" }}>
          <Chat selectedDocumentId={selectedDocumentId} />
        </main>

      </div>
    </div>
  );
}
