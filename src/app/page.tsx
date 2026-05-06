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
        <header className="relative flex flex-col items-center gap-3 text-center sm:min-h-[44px] sm:justify-center">
          <div className="flex w-full justify-start sm:absolute sm:left-0 sm:top-1/2 sm:w-auto sm:-translate-y-1/2">
            <HomeButton />
          </div>
          <div className="flex w-full justify-end gap-2 sm:absolute sm:right-0 sm:top-1/2 sm:w-auto sm:-translate-y-1/2">
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
          <p className="text-base font-semibold uppercase tracking-[0.2em] text-zinc-700 sm:text-lg">
            Picture Book Studio
          </p>
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
