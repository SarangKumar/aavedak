import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/job-tracker", label: "Job tracker" },
  { href: "/documents", label: "Documents" },
  { href: "/referrals", label: "Referrals" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 p-8">
      <Image src="/brand/icon.png" alt="Avsar" width={96} height={96} priority />
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Avsar</h1>
        <p className="mt-2 text-sm text-neutral-400">Opportunity — scaffold only</p>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              className="block rounded-lg border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-900"
              href={l.href}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
