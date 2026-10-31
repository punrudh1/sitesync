'use client';

import { ArrowUpRight, Cloud, MapPin, MousePointer2, Square, Type } from 'lucide-react';
import type { Tool } from '@/lib/markup';

const TOOLS: { id: Tool; label: string; icon: typeof MapPin }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'pin', label: 'Pin comment', icon: MapPin }, { id: 'text', label: 'Text note', icon: Type },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight }, { id: 'rectangle', label: 'Rectangle', icon: Square }, { id: 'cloud', label: 'Revision cloud', icon: Cloud },
];

export function MarkupToolbar({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div role="toolbar" aria-label="Markup tools" className="flex items-center gap-1">
      <span className="mx-1 h-5 w-px bg-slate-200" />
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button key={id} className={`rounded p-1.5 hover:bg-slate-100 ${tool === id ? 'bg-brand-light text-brand' : ''}`} aria-pressed={tool === id} aria-label={label} title={label} onClick={() => onTool(id)}><Icon size={18} /></button>))}
    </div>
  );
}
