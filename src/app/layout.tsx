import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Picture Book Studio",
  description: "Picture Book Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
