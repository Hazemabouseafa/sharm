import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ManageBookingClient } from '@/components/public/ManageBookingClient';

export const metadata: Metadata = {
  title: 'Manage Your Booking',
  robots: { index: false, follow: false },
};

export default function ManageBookingPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-[#52606D]">Loading booking access...</div>}>
      <ManageBookingClient />
    </Suspense>
  );
}
