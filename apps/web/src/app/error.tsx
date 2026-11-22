'use client';

import React from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F5EF] px-4 text-center">
      <div className="max-w-md rounded-2xl border border-[#E5DFD2] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[#103D45]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#52606D]">
          {error.message || 'An unexpected error occurred while loading this page. No reservation data was lost.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] rounded-full bg-[#0E7C78] px-5 text-sm font-bold text-white"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-full border border-[#CBD5E1] px-5 text-sm font-bold text-[#103D45]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
