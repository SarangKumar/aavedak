"use client";

import { useMemo, useState } from "react";

import type { ApplicationDto } from "@/components/job-tracker-board";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { Modal } from "@/components/ui/modal";
import {
  APPLICATION_IMPORT_SAMPLE,
  getApplicationImportHumanReadable,
  parseAndValidateApplicationsImport,
  type ApplicationImportError,
} from "@/lib/application-import";
import { cn } from "@/lib/utils";

type ImportApplicationsDialogProps = {
  open: boolean;
  onClose: () => void;
  onImported: (apps: ApplicationDto[]) => void;
};

export function ImportApplicationsDialog({
  open,
  onClose,
  onImported,
}: ImportApplicationsDialogProps) {
  const [files, setFiles] = useState<FileUploadFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApplicationImportError[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState<"schema" | "sample" | null>(null);

  const humanSchema = useMemo(() => getApplicationImportHumanReadable(), []);
  const sampleJson = useMemo(() => JSON.stringify(APPLICATION_IMPORT_SAMPLE, null, 2), []);

  async function copyText(kind: "schema" | "sample", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function handleFilesChange(next: FileUploadFile[]) {
    setFiles(next);
    setError(null);
    setFieldErrors([]);
    setSummary(null);
  }

  async function runImport() {
    setError(null);
    setFieldErrors([]);
    setSummary(null);
    const file = files[0]?.file;
    if (!file) {
      setError("Choose a .json file first.");
      return;
    }
    setPending(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        setError("File is not valid JSON.");
        return;
      }

      const client = parseAndValidateApplicationsImport(parsed);
      if (!client.ok) {
        setError("Validation failed. Nothing was imported.");
        setFieldErrors(client.errors);
        return;
      }

      const body = Array.isArray(parsed) ? { applications: parsed } : parsed;

      const res = await fetch("/api/applications/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        inserted?: ApplicationDto[];
        skippedDuplicates?: Array<{ companyName: string; role: string }>;
        insertedCount?: number;
        skippedCount?: number;
        error?: string;
        errors?: ApplicationImportError[];
      };
      if (!res.ok) {
        setError(data.error || "Import failed.");
        setFieldErrors(data.errors ?? []);
        return;
      }

      const inserted = data.inserted ?? [];
      onImported(inserted);
      const skipped = data.skippedCount ?? 0;
      setSummary(
        `Imported ${data.insertedCount ?? inserted.length}` +
          (skipped > 0 ? `; skipped ${skipped} duplicate company+role` : "") +
          ".",
      );
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import applications"
      size="lg"
      description="Upload a JSON file matching the schema below. Invalid files are rejected entirely — nothing is partially imported."
      footer={
        <>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="border-border bg-card/70 text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={pending || files.length === 0}
            onClick={() => void runImport()}
            className={cn(
              "avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90",
              (pending || files.length === 0) && "opacity-60",
            )}
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-foreground text-[12px] font-semibold">Schema</h3>
            <button
              type="button"
              onClick={() => void copyText("schema", humanSchema)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              {copied === "schema" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="border-border/80 bg-muted/40 text-muted-foreground max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border p-2.5 font-mono text-[10px] leading-relaxed">
            {humanSchema}
          </pre>
          <p className="text-muted-foreground text-[11px]">
            Machine-readable:{" "}
            <a
              href="/schemas/applications-import.json"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              /schemas/applications-import.json
            </a>{" "}
            ·{" "}
            <a
              href="/api/applications/import/schema"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              /api/applications/import/schema
            </a>
          </p>
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-foreground text-[12px] font-semibold">Sample JSON</h3>
            <button
              type="button"
              onClick={() => void copyText("sample", sampleJson)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              {copied === "sample" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="border-border/80 bg-muted/40 text-muted-foreground max-h-36 overflow-auto rounded-xl border p-2.5 font-mono text-[10px] leading-relaxed">
            {sampleJson}
          </pre>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-foreground text-[12px] font-semibold">Upload .json</h3>
          <FileUpload
            accept="application/json,.json"
            multiple={false}
            maxSize={2 * 1024 * 1024}
            files={files}
            onFilesChange={(next) => void handleFilesChange(next)}
            disabled={pending}
          >
            <FileUploadDropzone className="min-h-20 rounded-xl text-[13px]">
              Drop a JSON file here, or click to browse
            </FileUploadDropzone>
            <FileUploadList />
          </FileUpload>
        </section>

        {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
        {fieldErrors.length > 0 ? (
          <ul className="border-destructive/30 bg-destructive/5 text-destructive max-h-32 space-y-1 overflow-auto rounded-xl border p-2.5 text-[11px]">
            {fieldErrors.map((e, i) => (
              <li key={`${e.index}-${e.field}-${i}`}>
                {e.index < 0 ? "Root" : `Item ${e.index}`}:{" "}
                <span className="font-mono">{e.field}</span> — {e.message}
              </li>
            ))}
          </ul>
        ) : null}
        {summary ? <p className="text-primary text-[13px] font-medium">{summary}</p> : null}
      </div>
    </Modal>
  );
}
