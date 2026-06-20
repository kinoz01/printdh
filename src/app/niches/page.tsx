import Link from "next/link";
import { NichesBoard } from "@/components/NichesBoard";

export default function NichesPage() {
  return (
    <main className="min-h-screen bg-zinc-50 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-1">
            <p className="text-base font-semibold uppercase tracking-[0.2em] text-zinc-700 sm:text-lg">
              Niches
            </p>
            <p className="text-sm text-zinc-500">
              Book links, author links, Amazon search pages, and niche ideas saved to disk.
            </p>
          </div>
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Studio
            </Link>
            <Link
              href="/metadata"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Metadata
            </Link>
            <Link
              href="/compressor"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Compressor
            </Link>
          </div>
        </header>
        <NichesBoard />
      </div>
    </main>
  );
}
