import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@sharm/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F5EF] px-4 text-center">
      <BrandLogo variant="stacked" size="md" />
      <h1 className="mt-6 text-4xl font-extrabold text-[#103D45]">Page Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-[#52606D]">
        The excursion or page you are looking for may have moved or been archived.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex min-h-[46px] items-center rounded-full bg-[#103D45] px-6 text-sm font-bold text-white hover:bg-[#0E7C78]">
          Return Home
        </Link>
        <Link href="/tours" className="inline-flex min-h-[46px] items-center rounded-full border border-[#C9A66B] bg-white px-6 text-sm font-bold text-[#103D45]">
          Explore Tours
        </Link>
      </div>
    </div>
  );
}
