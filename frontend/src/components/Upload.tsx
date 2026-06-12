/**
 * Upload.tsx — Drag-and-drop PDF upload component
 *
 * Minimal dashed-border drop zone. State machine drives the visual:
 *   idle → uploading → success | error
 *
 * Progress bar appears only during the HTTP transfer phase.
 * Success auto-resets after 2 s so the zone stays ready.
 */

import { useState, useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

interface Props {
  onSuccess: () => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export default function Upload({ onSuccess }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const code = rejectedFiles[0].errors[0].code;
        setError(
          code === "file-too-large"
            ? "File exceeds the 20 MB limit."
            : code === "file-invalid-type"
            ? "Only PDF files are accepted."
            : rejectedFiles[0].errors[0].message
        );
        setState("error");
        return;
      }

      if (acceptedFiles.length === 0) return;

      setError(null);
      setState("uploading");
      setProgress(0);

      const formData = new FormData();
      formData.append("file", acceptedFiles[0]);

      try {
        await axios.post(`${API_BASE}/documents/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (evt) => {
            if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });

        setState("success");
        setProgress(100);
        onSuccess();

        // Give the user a moment to see the success state before resetting
        setTimeout(() => {
          setState("idle");
          setProgress(0);
        }, 2000);
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.detail
            ? err.response.data.detail
            : "Upload failed. Check the server logs.";
        setError(msg);
        setState("error");
        setProgress(0);
      }
    },
    [onSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: state === "uploading",
  });

  // Derive border color from current state
  const borderColor =
    isDragActive
      ? "var(--fg)"
      : state === "success"
      ? "#16a34a"
      : state === "error"
      ? "#dc2626"
      : "var(--border)";

  const labelText =
    state === "uploading"
      ? "Uploading…"
      : state === "success"
      ? "Uploaded — processing in background"
      : isDragActive
      ? "Drop your PDF here"
      : "Drop a PDF or click to browse";

  return (
    <div>
      {/* Drop zone */}
      <div
        {...getRootProps()}
        style={{
          border: `1.5px dashed ${borderColor}`,
          borderRadius: "6px",
          padding: "16px 12px",
          textAlign: "center",
          cursor: state === "uploading" ? "not-allowed" : "pointer",
          opacity: state === "uploading" ? 0.65 : 1,
          transition: "border-color 0.15s",
          background: isDragActive ? "var(--surface)" : "transparent",
        }}
      >
        <input {...getInputProps()} />

        {/* Upload icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
          {state === "success" ? (
            <svg
              width="20" height="20"
              viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              width="20" height="20"
              viewBox="0 0 24 24" fill="none"
              stroke="var(--muted)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>

        <p
          className="text-sm"
          style={{ color: state === "success" ? "#16a34a" : "var(--fg)" }}
        >
          {labelText}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          PDF only · max 20 MB
        </p>
      </div>

      {/* Progress bar — thin line under the zone */}
      {state === "uploading" && (
        <div
          style={{
            marginTop: "8px",
            height: "2px",
            background: "var(--border)",
            borderRadius: "999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "var(--fg)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      )}

      {/* Error message */}
      {error && state === "error" && (
        <p className="text-xs mt-2" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  );
}
