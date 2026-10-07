import { useRef, useState } from "react";
import { Upload } from "lucide-react";

export default function TextFileImport({
  label,
  onImport,
  disabled,
}: {
  label: string;
  onImport: (text: string) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function read(file: File) {
    setError("");
    setMessage("");
    if (!/\.(txt|md|csv)$/i.test(file.name)) {
      setError(
        "Choose a .txt, .md or .csv file. Other formats aren’t supported yet.",
      );
      return;
    }
    if (file.size > 250_000) {
      setError(
        "Choose a file smaller than 250 KB, or paste the relevant excerpt.",
      );
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (!text.trim())
        throw new Error("This file is empty. Choose a file with text.");
      if (text.includes("\0") || text.includes("\uFFFD")) {
        throw new Error("Save the file as UTF-8 text and try again.");
      }
      onImport(`Source: ${file.name}\n${text.trim()}`);
      setMessage(
        `Added ${file.name}. Review the text above before generating.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to read this file. Try pasting its text.",
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="file-import">
      <input
        ref={input}
        hidden
        type="file"
        accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
        aria-label={`Import file for ${label}`}
        disabled={disabled || reading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
      <button
        type="button"
        className="button small"
        disabled={disabled || reading}
        onClick={() => input.current?.click()}
        aria-label={`Import text for ${label}`}
      >
        <Upload size={13} /> {reading ? "Reading file…" : "Import text"}
      </button>
      <small>
        TXT, MD or CSV · up to 250 KB
        <br />
        Adds to your text · read in this browser
      </small>
      <p role="status">{message}</p>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
