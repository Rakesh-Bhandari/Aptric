import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * The brand utilities in index.css (bg-gradient-*, bg-dots, text-gradient-brand)
 * are background images, not colours. Without this, tailwind-merge reads
 * bg-gradient-primary as a background colour and drops the solid bg-primary
 * fallback next to it.
 */
const twMerge = extendTailwindMerge<'text-gradient'>({
  extend: {
    classGroups: {
      'bg-image': [{ 'bg-gradient': ['primary', 'primary-hover', 'secondary', 'navy', 'hero'] }, 'bg-dots'],
      'text-gradient': ['text-gradient-brand'],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
