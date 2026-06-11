/**
 * App.tsx — Root layout
 *
 * Two-panel design:
 *   Left (35%): document management — upload + list
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
  // null means "search all documents"
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  // Bump this counter to trigger a DocumentList re-fetch after upload
  const [refreshKey, setRefreshKey] = useState(0);

  function handleUploadSuccess() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* ── Left panel ── */}
      <aside className="w-[35%] min-w-[280px] border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Sourcely</h1>
          <p className="text-xs text-gray-400 mt-0.5">RAG-powered document Q&amp;A</p>
        </div>

        {/* Upload zone */}
        <div className="px-4 py-4 border-b border-gray-100">
          <Upload onSuccess={handleUploadSuccess} />
        </div>

        {/* Document list fills remaining space with scroll */}
        <div className="flex-1 overflow-y-auto">
          <DocumentList
            key={refreshKey}
            selectedId={selectedDocumentId}
            onSelect={setSelectedDocumentId}
          />
        </div>
      </aside>

      {/* ── Right panel ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <Chat selectedDocumentId={selectedDocumentId} />
      </main>
    </div>
  );
}
