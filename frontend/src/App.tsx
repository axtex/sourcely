/**
 * App.tsx — Root layout
 *
 * Desktop (lg+): top bar + 35/65 side-by-side split
 *   Left: upload + document list
 *   Right: chat
 *
 * Below md: one panel at a time with a bottom tab bar (Documents | Chat).
 * md+: side-by-side split (tablet landscape and desktop).
 * selectedDocumentId flows to both panels; selecting a doc on mobile switches to Chat.
 */

import { useState } from "react";
import DocumentList from "./components/DocumentList";
import Upload from "./components/Upload";
import Chat from "./components/Chat";
import "./index.css";

type MobilePanel = "documents" | "chat";

export default function App() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");

  function handleUploadSuccess() {
    setRefreshKey((k) => k + 1);
    setMobilePanel("documents");
  }

  function handleSelectDocument(id: string | null) {
    setSelectedDocumentId(id);
    // Jump to chat after picking a scope on small screens
    if (id !== null) setMobilePanel("chat");
  }

  return (
    <div
      className="flex flex-col h-full font-sans"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      {/* ── Top bar ── */}
      <header
        className="flex items-center px-4 sm:px-6 h-11 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h1 className="font-mono text-sm tracking-tight m-0 font-normal" style={{ color: "var(--fg)" }}>
          sourcely
        </h1>
        <span
          className="ml-3 sm:ml-4 text-[10px] uppercase tracking-[0.14em] hidden sm:block"
          style={{ color: "var(--muted)" }}
        >
          document Q&amp;A
        </span>
      </header>

      {/* ── Panels: stacked + tabbed on small screens, split on lg+ ── */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside
          className={[
            "app-aside flex flex-col min-h-0 w-full md:w-[35%] md:max-w-[420px] md:shrink-0",
            mobilePanel === "documents" ? "flex flex-1" : "hidden md:flex",
          ].join(" ")}
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <div
            className="px-4 py-4 shrink-0 md:border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload onSuccess={handleUploadSuccess} />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <DocumentList
              key={refreshKey}
              selectedId={selectedDocumentId}
              onSelect={handleSelectDocument}
            />
          </div>
        </aside>

        <main
          className={[
            "flex flex-col min-w-0 min-h-0 flex-1",
            mobilePanel === "chat" ? "flex" : "hidden md:flex",
          ].join(" ")}
          style={{ background: "var(--bg)" }}
        >
          <Chat selectedDocumentId={selectedDocumentId} />
        </main>
      </div>

      {/* ── Mobile bottom nav (thumb zone) ── */}
      <nav
        className="mobile-tab-bar md:hidden shrink-0 grid grid-cols-2"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}
        aria-label="Main sections"
      >
        <MobileTab
          label="Documents"
          active={mobilePanel === "documents"}
          onClick={() => setMobilePanel("documents")}
        />
        <MobileTab
          label="Chat"
          active={mobilePanel === "chat"}
          onClick={() => setMobilePanel("chat")}
        />
      </nav>
    </div>
  );
}

function MobileTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="touch-target interactive-btn w-full font-mono text-xs uppercase tracking-[0.12em]"
      style={{
        color: active ? "var(--fg)" : "var(--muted)",
        background: active ? "var(--surface)" : "transparent",
        border: "none",
        fontFamily: "inherit",
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </button>
  );
}
