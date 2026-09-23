import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Storefront",
  description: "A minimal demo storefront built on Next.js.",
};

function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Storefront
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <Link href="/" className="transition-colors hover:text-foreground">
            Products
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Header />
        {children}
        <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
          Demo storefront for the Jev routing POC.
        </footer>
      </body>
    </html>
  );
}
