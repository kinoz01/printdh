import { promises as fs } from "fs";
import path from "path";
import { GeneratorApp } from "@/components/GeneratorApp";
import { PdfCompressor } from "@/components/PdfCompressor";

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
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Facts Picture Book Studio
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            Convert your Python book recipes into a browser-based workflow.
          </h1>
          <p className="text-sm text-zinc-700">
            Drop in the same JSON/text files you used for the CLI scripts, tweak overlay settings, and download a PDF directly from the Next.js app.
          </p>
        </header>
        <GeneratorApp
          initialFacts={facts}
          initialList={list}
          initialListDescription={listDescription}
          defaultImageLibrary="../images"
        />
        <PdfCompressor />
      </div>
    </main>
  );
}
