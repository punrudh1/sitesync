import { cn } from '@/lib/utils';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, id, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; error?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-navy-700">{label}</label>
      <input id={id} name={id} aria-invalid={!!error}
        className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', error && 'border-red-500')} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TextArea({ label, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-navy-700">{label}</label>
      <textarea id={id} name={id} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" {...props} />
    </div>
  );
}
