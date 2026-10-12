"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PreviewableResume = { id: string; displayName: string };

export function ResumePreviewButton({
  resumeName,
  onClick,
  size = "icon-xs",
  className,
}: {
  resumeName: string;
  onClick: () => void;
  size?: "icon-xs" | "icon-sm";
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size={size}
      type="button"
      title="Preview"
      aria-label={`Preview ${resumeName}`}
      onClick={onClick}
      className={className}
    >
      <SearchIcon className="size-3.5" />
    </Button>
  );
}

export function ResumePreviewDialog({
  resume,
  description,
  onClose,
}: {
  resume: PreviewableResume | null;
  description?: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(resume)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent size="a4" className="gap-3">
        <DialogHeader className="flex-row items-start justify-between gap-3 text-left">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="truncate">
              {resume?.displayName ?? "Resume preview"}
            </DialogTitle>
            <DialogDescription>{resume ? description : undefined}</DialogDescription>
          </div>
          {/* Laptop: actions sit top-right, like the other dialogs. Phones use the footer below. */}
          {resume ? (
            <div className="gap-1.6 hidden shrink-0 items-center sm:flex">
              <a
                href={`/api/resumes/${resume.id}/file`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open in new tab
                <ExternalLinkIcon className="ml-1 size-3.5" />
              </a>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label="Close preview"
                onClick={onClose}
              >
                <CloseIcon className="size-4" />
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        {resume ? (
          <iframe
            key={resume.id}
            src={`/api/resumes/${resume.id}/file`}
            title={`Preview of ${resume.displayName}`}
            className="bg-background mx-auto block aspect-[210/297] h-[calc(100dvh-16rem)] max-h-full w-auto max-w-full rounded-md border-0 sm:h-[calc(100dvh-13rem)]"
          />
        ) : null}

        <DialogFooter className="sm:hidden">
          {resume ? (
            <>
              <a
                href={`/api/resumes/${resume.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
              >
                Open in new tab
              </a>
              <Button size="sm" type="button" onClick={onClose}>
                Close
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.2 10.2 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
