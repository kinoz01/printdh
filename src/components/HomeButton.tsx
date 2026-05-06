"use client";

import { useCallback } from "react";

export function HomeButton() {
  const handleClick = useCallback(() => {
    window.location.assign("/");
  }, []);

  return (
    <button
      type="button"
      aria-label="Go to layout home page"
      onClick={handleClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-900 shadow-sm transition hover:border-zinc-400"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M12 3.59 4 10.19V21h5v-6h6v6h5V10.19L12 3.59Zm10 7.19-2 2.3V21a2 2 0 0 1-2 2h-4a1 1 0 0 1-1-1v-6h-2v6a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2v-7.92l-2-2.3a1 1 0 0 1 .13-1.41l9.23-7.62a1 1 0 0 1 1.28 0l9.23 7.62A1 1 0 0 1 22 10.78Z" />
      </svg>
    </button>
  );
}
