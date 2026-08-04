import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { Suspense } from "react";
import { GeneratorApp } from "@/components/GeneratorApp";
import { HomeButton } from "@/components/HomeButton";

const DATA_DIR = path.resolve(process.cwd(), "..", "data");

async function readFileSafe(filename: string) {
  try {
    const buffer = await fs.readFile(path.join(DATA_DIR, filename), "utf-8");
    return buffer.trim();
  } catch {
    return "";
  }
}

export default async function HomePage() {
  const [facts, list, listDescription] = await Promise.all([
    readFileSafe("facts.json"),
    readFileSafe("list.json"),
    readFileSafe("list_description.json"),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <header className="flex flex-col items-center gap-4 text-center">
          <p className="text-base font-semibold uppercase tracking-[0.2em] text-zinc-700 sm:text-lg">
            Picture Book Studio
          </p>
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <HomeButton />
            <div className="flex flex-wrap justify-end gap-2">
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
              <Link
                href="/hardcover-resizer"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
              >
                Hardcover Resizer
              </Link>
              <Link
                href="/crop-images"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
              >
                Crop Images
              </Link>
              <Link
                href="/rmpdf"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
              >
                rmpdf
              </Link>
              <Link
                href="/niches"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
              >
                Niches
              </Link>
            </div>
          </div>
        </header>
        <Suspense fallback={null}>
          <GeneratorApp
            initialFacts={facts}
            initialList={list}
            initialListDescription={listDescription}
            defaultImageLibrary="../images"
          />
        </Suspense>
      </div>
    </main>
  );
}
