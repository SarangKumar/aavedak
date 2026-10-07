import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Admin",
};

export default function Page() {
  return (
    <PageStub
      title="Admin"
      description="Global catalog and system ops."
      hint="Catalog sync and ops tools are reserved for admins."
    />
  );
}
