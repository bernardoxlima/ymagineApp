'use client';

import { cn } from '@/lib/utils';

interface AppLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}

export function AppLogo({ size = 24, variant = 'symbol', className }: AppLogoProps) {
  // For logomark variant, use logomark-white.svg which is already white
  // and invert it for light mode using CSS (no JS needed)
  if (variant === 'logomark') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logomark-white.svg"
        alt="Kortix"
        className={cn('invert dark:invert-0 flex-shrink-0', className)}
        style={{ height: `${size}px`, width: 'auto' }}
        suppressHydrationWarning
      />
    );
  }

  // Default symbol variant behavior - invert for dark mode
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ymagine-symbol.svg"
      alt="Kortix"
      className={cn('dark:invert flex-shrink-0', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      suppressHydrationWarning
    />
  );
}
