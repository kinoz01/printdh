import Link from "next/link";
import { HomeButton } from "@/components/HomeButton";
import { ImageCropper } from "@/components/ImageCropper";

export default function CropImagesPage() {
  return (
    <main className="min-h-screen bg-zinc-50 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <header className="flex flex-col gap-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <HomeButton />
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Studio
            </Link>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tools</p>
            <h1 className="text-2xl font-semibold text-zinc-950">Crop Images</h1>
          </div>
        </header>
        <ImageCropper />
      </div>
    </main>
  );
}
