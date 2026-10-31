import { HardHat } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-navy-950">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white"><HardHat size={18} aria-hidden /></span>
      {BRAND.name}
    </span>
  );
}
