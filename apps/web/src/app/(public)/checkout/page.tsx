import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { CheckoutClient } from '@/components/public/CheckoutClient';

export const metadata: Metadata = {
  title: 'Complete Your Booking Request',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-[#52606D]">Loading checkout...</div>}>
      <CheckoutClient />
    </Suspense>
  );
}
