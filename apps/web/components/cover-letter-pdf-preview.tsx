"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FooterRowItem } from "@/lib/cover-letter-download";
import { cn } from "@/lib/utils";

export type CoverLetterPdfPreviewProps = {
  title: string;
  body: string;
  companyName?: string;
  role?: string;
  footerRow: FooterRowItem[];
  /** Called whenever one-page fit changes. */
  onOverflowChange?: (overflows: boolean) => void;
  className?: string;
};

const PAPER_FONT = 'Helvetica, Arial, "Helvetica Neue", ui-sans-serif, system-ui, sans-serif';

function ZoomOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.25 7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M10.25 10.25 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PaperContent({
  title,
  body,
  companyName,
  role,
  footerRow,
  contentRef,
  denser,
  fillPage,
}: {
  title: string;
  body: string;
  companyName?: string;
  role?: string;
  footerRow: FooterRowItem[];
  /** Measures the main text block for one-page overflow (not the outer page). */
  contentRef?: RefObject<HTMLDivElement | null>;
  /** Slightly larger type for the zoomed modal (still print-like). */
  denser?: boolean;
  /** Stretch to full page height so footer can sit at the page bottom. */
  fillPage?: boolean;
}) {
  const footer =
    footerRow.length > 0 ? (
      <div className="shrink-0 border-t border-neutral-200 pt-2.5">
        <p
          className={
            denser
              ? "flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-neutral-600"
              : "flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] text-neutral-600"
          }
        >
          {footerRow.map((item, idx) => (
            <span key={item.key} className="inline-flex items-center gap-x-1">
              {idx > 0 ? (
                <span className="text-neutral-400" aria-hidden>
                  ⋅
                </span>
              ) : null}
              <a
                href={item.href}
                target={item.key === "email" ? undefined : "_blank"}
                rel={item.key === "email" ? undefined : "noreferrer"}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {item.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    ) : null;

  return (
    <div
      className={
        fillPage
          ? "box-border flex h-full min-h-full w-full flex-col px-[9%] pb-[8%] pt-[8%] text-black"
          : "box-border flex w-full flex-col px-[9%] pb-[8%] pt-[8%] text-black"
      }
      style={{ fontFamily: PAPER_FONT }}
    >
      <div ref={contentRef} className="min-h-0 flex-1 overflow-hidden">
        <p
          className={
            denser
              ? "text-[14px] font-bold leading-snug tracking-tight text-black"
              : "text-[12.5px] font-bold leading-snug tracking-tight text-black"
          }
        >
          {title || "(untitled cover letter)"}
        </p>
        {companyName || role ? (
          <p
            className={
              denser
                ? "mt-1.5 text-[10.5px] leading-snug text-neutral-500"
                : "mt-1.5 text-[9.5px] leading-snug text-neutral-500"
            }
          >
            {companyName ? `Company: ${companyName}` : null}
            {companyName && role ? " · " : null}
            {role ? `Role: ${role}` : null}
          </p>
        ) : (
          <p
            className={
              denser
                ? "mt-1.5 text-[10.5px] text-neutral-500"
                : "mt-1.5 text-[9.5px] text-neutral-500"
            }
          >
            Pick an application to fill {"{{company}}"} / {"{{role}}"}.
          </p>
        )}
        <pre
          className={
            denser
              ? "mt-4 whitespace-pre-wrap font-sans text-[11.5px] leading-[1.45] text-neutral-900"
              : "mt-4 whitespace-pre-wrap font-sans text-[10.5px] leading-[1.45] text-neutral-900"
          }
          style={{ fontFamily: PAPER_FONT }}
        >
          {body || "(empty body)"}
        </pre>
      </div>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
}

function A4Paper({
  children,
  className,
  pageRef,
  showZoom,
  onZoom,
}: {
  children: ReactNode;
  className?: string;
  pageRef?: RefObject<HTMLDivElement | null>;
  showZoom?: boolean;
  onZoom?: () => void;
}) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-[34rem] xl:max-w-none", className)}
      style={{ aspectRatio: "210 / 297" }}
    >
      {showZoom && onZoom ? (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={onZoom}
          aria-label="Open full PDF preview"
          title="Open full PDF preview"
          className="absolute right-2 top-2 z-10 border-neutral-300 bg-white/95 text-neutral-800 shadow-sm hover:bg-white"
        >
          <ZoomOutIcon className="size-3.5" />
        </Button>
      ) : null}
      <div
        ref={pageRef}
        className="absolute inset-0 overflow-hidden rounded-[2px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
      >
        {children}
      </div>
    </div>
  );
}

export function CoverLetterPdfPreview({
  title,
  body,
  companyName,
  role,
  footerRow,
  onOverflowChange,
  className,
}: CoverLetterPdfPreviewProps) {
  const [zoomed, setZoomed] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      const next = content.scrollHeight > content.clientHeight + 1;
      setOverflows((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [title, body, companyName, role, footerRow]);

  useEffect(() => {
    onOverflowChange?.(overflows);
  }, [overflows, onOverflowChange]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0">
        <p className="aavedak-section-title text-foreground">Live PDF preview</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          A4 · print-scale type · one page max. Variables resolve from the selected application.
        </p>
      </div>

      <ScrollArea className="relative min-h-0 flex-1 rounded-md bg-[#e8e8e8] p-3 sm:p-4 dark:bg-[#2a2a2a]">
        <A4Paper pageRef={pageRef} showZoom onZoom={() => setZoomed(true)}>
          <PaperContent
            title={title}
            body={body}
            companyName={companyName}
            role={role}
            footerRow={footerRow}
            contentRef={contentRef}
            fillPage
          />
        </A4Paper>
      </ScrollArea>

      {overflows ? (
        <Alert variant="destructive" className="mt-2 shrink-0">
          <AlertDescription>
            Cover letter must fit on a single A4 page. Shorten the body or footer before saving or
            downloading.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground mt-2 shrink-0 text-[11px]">Fits on one A4 page.</p>
      )}

      <Dialog
        open={zoomed}
        onOpenChange={(next) => {
          if (!next) (() => setZoomed(false))();
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Cover letter preview</DialogTitle>
            <DialogDescription>Full A4 preview (print-scale).</DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-[#e8e8e8] p-4 dark:bg-[#2a2a2a]">
            <div
              className="relative mx-auto w-full max-w-[48rem]"
              style={{ aspectRatio: "210 / 297" }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-[2px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/5">
                <PaperContent
                  title={title}
                  body={body}
                  companyName={companyName}
                  role={role}
                  footerRow={footerRow}
                  denser
                  fillPage
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
