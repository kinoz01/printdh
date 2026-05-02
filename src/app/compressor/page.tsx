import Link from "next/link";
import { PdfCompressor } from "@/components/PdfCompressor";

export default function CompressorPage() {
  return (
    <main className="min-h-screen bg-zinc-50 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <header className="relative flex flex-col items-center gap-3 text-center">
          <Link
            href="/"
            className="absolute right-0 top-0 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
          >
            Studio
          </Link>
          <p className="text-base font-semibold uppercase tracking-[0.2em] text-zinc-700 sm:text-lg">
            PDF Compressor
          </p>
        </header>
        <PdfCompressor />
      </div>
    </main>
  );
}
