import Link from "next/link";
import { MetadataManager } from "@/components/MetadataManager";

export default function MetadataPage() {
  return (
    <main className="min-h-screen bg-zinc-50 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <header className="flex flex-col gap-3 text-center sm:relative sm:items-center">
          <div className="flex w-full justify-end gap-2 sm:absolute sm:right-0 sm:top-0 sm:w-auto">
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Studio
            </Link>
            <Link
              href="/compressor"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Compressor
            </Link>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold uppercase tracking-[0.2em] text-zinc-700 sm:text-lg">
              Book Metadata
            </p>
            <p className="text-sm text-zinc-500">(Be Careful of Trademarks)</p>
          </div>
        </header>
        <MetadataManager />
      </div>
    </main>
  );
}
