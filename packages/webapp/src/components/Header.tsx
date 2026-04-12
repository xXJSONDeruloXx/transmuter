import React from 'react';

import logoUrl from '../assets/logo.png';

interface HeaderProps {
  subtitle: string;
  rightContent: React.ReactNode;
}

/**
 * Shared header card — same structural pattern as Mizuchi / gba-kit
 * (rounded-2xl dark gradient panel with logo, gradient title, subtitle,
 * right-side content, and a gradient underline strip).
 *
 * Transmuter uses an orange → amber → flame-teal gradient instead of
 * Mizuchi's blue → cyan → teal.
 */
export function Header({ subtitle, rightContent }: HeaderProps): React.ReactElement {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-xl mb-8 overflow-hidden">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-orange-500/25 blur-xl rounded-full" />
              <img
                src={logoUrl}
                alt="Transmuter Logo"
                className="relative w-16 h-16 object-contain drop-shadow-lg rounded-full"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-teal-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                  Transmuter
                </span>
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="text-right flex-shrink-0">{rightContent}</div>
        </div>
      </div>

      <div className="h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-500" />
    </header>
  );
}
