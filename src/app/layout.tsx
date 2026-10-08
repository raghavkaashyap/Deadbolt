import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hackathon Template",
  description: "A minimal Next.js + Supabase starter for hackathons",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <header className="border-b bg-white px-6 py-4">
          <nav className="mx-auto flex max-w-5xl items-center justify-between">
            <span className="text-xl font-bold">🚀 HackTemplate</span>
            <div className="flex gap-4 text-sm text-gray-600">
              <a href="/" className="hover:text-gray-900">Home</a>
              <a
                href="https://supabase.com/docs"
                target="_blank"
                rel="noreferrer"
                className="hover:text-gray-900"
              >
                Supabase Docs
              </a>
              <a
                href="https://nextjs.org/docs"
                target="_blank"
                rel="noreferrer"
                className="hover:text-gray-900"
              >
                Next.js Docs
              </a>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <footer className="border-t bg-white px-6 py-4 text-center text-sm text-gray-400">
          Built with Next.js + Supabase · Deploy on Vercel
        </footer>
      </body>
    </html>
  );
}
