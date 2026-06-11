/**
 * Upload.tsx — Drag-and-drop PDF upload component
 *
 * Uses react-dropzone for drag-and-drop handling.
 * Shows a progress indicator while uploading and clear
 * error messages for validation failures (wrong type, too large).
 */

import { useState, useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

interface Props {
  onSuccess: () => void; // called after a successful upload so parent can re-fetch list
}

type UploadState = "idle" | "uploading" | "success" | "error";

export default function Upload({ onSuccess }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // 0–100

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Handle dropzone-level rejections (wrong type, too large)
      if (rejectedFiles.length > 0) {
        const firstError = rejectedFiles[0].errors[0];
        if (firstError.code === "file-too-large") {
          setError("File exceeds the 20 MB limit.");
        } else if (firstError.code === "file-invalid-type") {
          setError("Only PDF files are accepted.");
        } else {
          setError(firstError.message);
        }
        return;
      }

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      setError(null);
      setState("uploading");
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      try {
        await axios.post(`${API_BASE}/documents/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (evt) => {
            if (evt.total) {
              // Upload progress reflects the HTTP transfer, not the processing pipeline
              setProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          },
        });

        setState("success");
        setProgress(100);
        onSuccess();

        // Reset to idle after a short delay so the user sees the success state
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

  // Dynamic border/background based on current state
  const zoneCls = [
    "relative border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors",
    isDragActive
      ? "border-indigo-400 bg-indigo-50"
      : state === "success"
      ? "border-green-400 bg-green-50"
      : state === "error"
      ? "border-red-300 bg-red-50"
      : "border-gray-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40",
    state === "uploading" ? "cursor-not-allowed opacity-70" : "",
  ].join(" ");

  return (
    <div>
      <div {...getRootProps({ className: zoneCls })}>
        <input {...getInputProps()} />

        {/* Icon */}
        <div className="flex justify-center mb-2">
          <svg
            className={`w-8 h-8 ${
              state === "success"
                ? "text-green-500"
                : state === "error"
                ? "text-red-400"
                : "text-gray-400"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {state === "success" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M5 13l4 4L19 7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            )}
          </svg>
        </div>

        {/* Label */}
        <p className="text-sm text-gray-600">
          {state === "uploading"
            ? "Uploading…"
            : state === "success"
            ? "Uploaded — processing in background"
            : isDragActive
            ? "Drop your PDF here"
            : "Drop a PDF or click to browse"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF only · max 20 MB</p>
      </div>

      {/* Progress bar — only visible while uploading */}
      {state === "uploading" && (
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
