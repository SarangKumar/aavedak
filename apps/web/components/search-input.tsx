"use client";

import type { ComponentProps } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  /** Classes for the outer field (width, height, background). */
  className?: string;
  /** Classes for the inner <input>. */
  inputClassName?: string;
};

/** Search field with a magnifying-glass icon before the placeholder (Vinyaas InputGroup). */
export function SearchInput({ className, inputClassName, ...props }: SearchInputProps) {
  return (
    <InputGroup className={cn("h-8 gap-1.5 px-2.5", className)}>
      <InputGroupAddon aria-hidden>
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        className={cn(
          "h-full text-[13px] [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
        {...props}
      />
    </InputGroup>
  );
}
