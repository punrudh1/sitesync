import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { BRAND } from '@/lib/brand';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { ThemeProvider, type ThemeMode, type AccentMode } from '@/components/theme-provider';

export const metadata: Metadata = { title: { default: BRAND.name, template: `%s · ${BRAND.name}` }, description: BRAND.tagline };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let theme: ThemeMode = 'dark';
  let accent: AccentMode = 'orange';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('theme_preference, accent_preference').eq('id', user.id).maybeSingle();
      if (data?.theme_preference) theme = data.theme_preference as ThemeMode;
      if (data?.accent_preference) accent = data.accent_preference as AccentMode;
    }
  } catch { /* Keep the default appearance on public/auth routes or before migration 0012. */ }
  return (
    <html lang="en">
      <body>
        <ThemeProvider initialTheme={theme} initialAccent={accent}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
        {children}
        <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
