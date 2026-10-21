"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { DOCUMENT_ACCEPT, type ImportedDocument } from "@/lib/document-import";

export default function DocumentFileImport({
  label,
  disabled,
  onImport,
  onRemove,
  variant = "button",
}: {
  label: string;
  disabled: boolean;
  onImport: (text: string, document: ImportedDocument) => void;
  onRemove?: () => boolean;
  variant?: "button" | "dropzone";
}) {
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ImportedDocument>();
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  async function read(file: File) {
    if (lock.current) return;
    lock.current = true;
    setReading(true);
    setError("");
    try {
      const { extractDocument } = await import("@/lib/document-import");
      const extracted = await extractDocument(file);
      onImport(extracted.text, extracted);
      setResult(extracted);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to read this file. Your existing brief is unchanged; paste the source text or retry.",
      );
    } finally {
      lock.current = false;
      setReading(false);
    }
  }
  return (
    <div
      className={`file-import${variant === "dropzone" ? " file-import-dropzone" : ""}${dragging ? " dragging" : ""}`}
      onDragOver={
        variant === "dropzone"
          ? (event) => {
              event.preventDefault();
              if (!disabled && !reading) setDragging(true);
            }
          : undefined
      }
      onDragLeave={
        variant === "dropzone" ? () => setDragging(false) : undefined
      }
      onDrop={
        variant === "dropzone"
          ? (event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && !disabled && !reading) void read(file);
            }
          : undefined
      }
    >
      <input
        ref={input}
        hidden
        type="file"
        accept={DOCUMENT_ACCEPT}
        aria-label={`Import file for ${label}`}
        disabled={disabled || reading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      <button
        type="button"
        className={variant === "dropzone" ? "file-drop-target" : "button small"}
        disabled={disabled || reading}
        onClick={() => input.current?.click()}
        aria-label={`Upload file for ${label}`}
      >
        <Upload size={variant === "dropzone" ? 22 : 13} />{" "}
        {reading
          ? "Reading file…"
          : variant === "dropzone"
            ? `Drop ${label} here or choose a file`
            : "Upload file"}
      </button>
      <small>
        PDF, DOCX, PPTX, TXT, MD or CSV · up to 15 MB
        {variant !== "dropzone" && (
          <>
            <br />
            Extracted in this browser · text only · no AI call
          </>
        )}
      </small>
      {result && variant === "dropzone" && (
        <div className="file-import-result">
          <span>{result.fileName}</span>
          {onRemove && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (onRemove()) setResult(undefined);
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}
      <p role="status">
        {reading
          ? "Reading the document. Large files may take a moment…"
          : result
            ? `Loaded ${result.fileName} into the draft. Review the extracted text before applying it.`
            : ""}
      </p>
      {result && result.warnings.length > 0 && (
        <details className="context-note" open>
          <summary>Extraction notes · review the original</summary>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
