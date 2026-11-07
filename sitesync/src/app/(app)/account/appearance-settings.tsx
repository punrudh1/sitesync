'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useAppearance, type ThemeMode, type AccentMode } from '@/components/theme-provider';
import { updateAppearance } from './actions';

const themes: { id: ThemeMode; label: string; help: string }[] = [
  { id: 'dark', label: 'Dark', help: 'Dark surfaces, easier on the eyes in low light' },
  { id: 'light', label: 'Light', help: 'Bright surfaces for well-lit environments' },
  { id: 'system', label: 'System', help: 'Follow your device appearance setting' },
];
const accents: { id: AccentMode; label: string; color: string }[] = [
  { id: 'orange', label: 'Orange', color: '#c2410c' },
  { id: 'blue', label: 'Blue', color: '#2563eb' },
  { id: 'green', label: 'Green', color: '#16a34a' },
  { id: 'purple', label: 'Purple', color: '#7c3aed' },
  { id: 'pink', label: 'Pink', color: '#db2777' },
];

export function AppearanceSettings({ initialTheme, initialAccent }: { initialTheme: ThemeMode; initialAccent: AccentMode }) {
  const { theme, accent, setTheme, setAccent } = useAppearance();
  const [pending, start] = useTransition();
  const save = (nextTheme: ThemeMode, nextAccent: AccentMode) => {
    start(async () => {
      const result = await updateAppearance(nextTheme, nextAccent);
      if (!result.ok) {
        setTheme(initialTheme); setAccent(initialAccent);
        toast.error(result.error);
      } else toast.success('Appearance preferences saved');
    });
  };
  return <section className="space-y-5">
    <div><h2 className="font-semibold">Appearance</h2><p className="text-sm text-navy-500">Personalise how SiteSync looks. These settings apply to your account.</p></div>
    <div className="space-y-2"><h3 className="text-sm font-medium">Theme</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {themes.map(item => <button key={item.id} type="button" disabled={pending} onClick={() => { setTheme(item.id); save(item.id, accent); }}
          aria-pressed={theme === item.id} className={`rounded-lg border p-3 text-left transition ${theme === item.id ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200'}`}>
          <span className="block font-medium">{item.label}</span><span className="mt-1 block text-xs text-navy-500">{item.help}</span>
        </button>)}
      </div>
    </div>
    <div className="space-y-2"><h3 className="text-sm font-medium">Accent colour</h3>
      <div className="flex flex-wrap gap-3">
        {accents.map(item => <button key={item.id} type="button" disabled={pending} onClick={() => { setAccent(item.id); save(theme, item.id); }}
          aria-label={item.label} aria-pressed={accent === item.id} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${accent === item.id ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200'}`}>
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: item.color }} />{item.label}
        </button>)}
      </div>
    </div>
    {pending && <p role="status" className="text-xs text-navy-500">Saving preferences…</p>}
  </section>;
}
