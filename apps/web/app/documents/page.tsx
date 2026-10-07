import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Documents",
};

export default function Page() {
  return (
    <PageStub
      title="Documents"
      description="Resumes, cover letters, and templates."
      hint="Upload, version, and activate documents from this library."
    />
  );
}
