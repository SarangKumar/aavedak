"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-foreground text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        If this is a fresh Vercel deploy, confirm Neon Postgres and Neon Auth environment variables,
        then reload. A database outage also lands on the setup page.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="bg-primary text-primary-foreground inline-flex h-9 w-fit items-center rounded-md px-3 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  );
}
