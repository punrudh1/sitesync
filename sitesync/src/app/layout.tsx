import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import './globals.css';

export const metadata: Metadata = { title: { default: BRAND.name, template: `%s · ${BRAND.name}` }, description: BRAND.tagline };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
