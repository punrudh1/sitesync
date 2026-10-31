import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

const styles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none px-4 py-2',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-dark',
        outline: 'border border-slate-300 bg-white hover:bg-slate-100',
        ghost: 'hover:bg-slate-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles>) {
  return <button className={cn(styles({ variant }), className)} {...props} />;
}
