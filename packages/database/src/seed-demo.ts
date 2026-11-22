import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { runProductionInit } from './seed-prod-init';
import { seedStorefrontCatalogAndCms } from './seed-storefront';

function sha256(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

export async function runDemoSeed(client: PrismaClient, opts?: { forceDemo?: boolean }): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !opts?.forceDemo) {
    throw new Error('Refusing to run demo seed when NODE_ENV=production');
  }
  if (process.env.DEMO_MODE !== 'true' && !opts?.forceDemo) {
    throw new Error('Demo seed requires DEMO_MODE=true (or explicit forceDemo option) to keep production data clean');
  }

  await runProductionInit(client);

  // Enable demo bank transfer configuration explicitly labeled as fictional example
  await client.siteSetting.update({
    where: { key: 'singleton' },
    data: {
      payLaterEnabled: true,
      bankTransferEnabled: true,
      bankDetailsJson: {
        bankName: 'Demo Example Commercial Bank (Replace Before Launch)',
        accountHolder: 'Sharm Pharaoh Travel (Demo Account)',
        iban: 'EG000000000000000000000000000',
        swift: 'DEMOEGCAXXX',
        instructions:
          'Include your booking reference in the transfer memo and upload your transfer receipt via your secure booking link. Demo details only — replace in Admin Settings before production.',
      },
      contactEmail: 'reservations@sharmpharaoh.example',
      contactPhone: '+20 100 000 0000 (Demo)',
      whatsappNumber: '',
      addressText: '',
    },
  });

  const { standardPolicyV1Id, toursMap } = await seedStorefrontCatalogAndCms(client, { demoMode: true });
  const standardPolicyV1 = await client.policyVersion.findUniqueOrThrow({ where: { id: standardPolicyV1Id } });

  // Promotions (Demo)
  await client.promotion.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      title: '10% Welcome Excursion Discount (Demo)',
      discountType: 'PERCENT',
      value: 1000,
      currency: 'USD',
      minOrderMinor: 5000,
      validFrom: new Date(Date.now() - 86400_000),
      validUntil: new Date(Date.now() + 180 * 86400_000),
      maxTotalUses: 100,
      maxUsesPerEmail: 2,
      isActive: true,
    },
  });

  await client.promotion.upsert({
    where: { code: 'REDSEA15' },
    update: {},
    create: {
      code: 'REDSEA15',
      title: '$15 Off Red Sea Excursions (Demo)',
      discountType: 'FIXED',
      value: 1500,
      currency: 'USD',
      minOrderMinor: 10000,
      validFrom: new Date(Date.now() - 86400_000),
      validUntil: new Date(Date.now() + 180 * 86400_000),
      maxTotalUses: 50,
      maxUsesPerEmail: 1,
      isActive: true,
    },
  });

  // Sample Demo Bookings across representative statuses (idempotent by reference)
  const demoBookings = [
    {
      reference: 'SPT-DEMO-1001',
      tourSlug: 'ras-mohamed-white-island',
      status: 'CONFIRMED' as const,
      paymentStatus: 'PAID' as const,
      leadName: 'Claire Bennett (Demo)',
      leadEmail: 'claire.bennett@example.com',
      leadPhone: '+44 7700 900101',
      adults: 2,
      children: 0,
      totalMinor: 12000,
      capturedMinor: 12000,
    },
    {
      reference: 'SPT-DEMO-1002',
      tourSlug: 'pyramids-and-sphinx-tour',
      status: 'REQUESTED' as const,
      paymentStatus: 'UNPAID' as const,
      leadName: 'David Morales (Demo)',
      leadEmail: 'david.morales@example.com',
      leadPhone: '+1 555 010 2042',
      adults: 2,
      children: 1,
      totalMinor: 19500,
      capturedMinor: 0,
    },
    {
      reference: 'SPT-DEMO-1003',
      tourSlug: 'luxor-karnak-valley-of-kings',
      status: 'CONFIRMED' as const,
      paymentStatus: 'PARTIALLY_PAID' as const,
      leadName: 'Hannah Lindholm (Demo)',
      leadEmail: 'hannah.lindholm@example.com',
      leadPhone: '+46 70 000 0199',
      adults: 2,
      children: 0,
      totalMinor: 19600,
      capturedMinor: 4900,
    },
    {
      reference: 'SPT-DEMO-1004',
      tourSlug: 'abu-dabbab-snorkeling',
      status: 'CANCELLED' as const,
      paymentStatus: 'UNPAID' as const,
      leadName: 'Marcus Vance (Demo)',
      leadEmail: 'marcus.vance@example.com',
      leadPhone: '+1 555 010 8877',
      adults: 2,
      children: 0,
      totalMinor: 11600,
      capturedMinor: 0,
    },
  ];

  for (const dbk of demoBookings) {
    const existing = await client.booking.findUnique({ where: { reference: dbk.reference } });
    if (existing) continue;
    const tInfo = toursMap.get(dbk.tourSlug)!;
    const dep = await client.departure.findUniqueOrThrow({ where: { id: tInfo.firstDepartureId } });
    const tour = await client.tour.findUniqueOrThrow({ where: { id: tInfo.id } });

    const customer = await client.customer.upsert({
      where: { email: dbk.leadEmail },
      update: {},
      create: {
        email: dbk.leadEmail,
        fullName: dbk.leadName,
        phone: dbk.leadPhone,
      },
    });

    const seats = dbk.adults + dbk.children;
    const isActiveAlloc = dbk.status === 'CONFIRMED' || dbk.status === 'REQUESTED';

    const booking = await client.booking.create({
      data: {
        reference: dbk.reference,
        status: dbk.status,
        paymentStatus: dbk.paymentStatus,
        tourId: tour.id,
        departureId: dep.id,
        customerId: customer.id,
        seatsAllocated: seats,
        allocationActive: isActiveAlloc,
        decisionDeadlineAt: dbk.status === 'REQUESTED' ? new Date(Date.now() + 24 * 3600_000) : null,
        currency: 'USD',
        pricingVersion: 1,
        baseSubtotalMinor: dbk.totalMinor,
        addonsSubtotalMinor: 0,
        pickupSubtotalMinor: 0,
        discountMinor: 0,
        serviceFeeMinor: 0,
        taxMinor: 0,
        grandTotalMinor: dbk.totalMinor,
        dueNowMinor: dbk.capturedMinor,
        dueLaterMinor: dbk.totalMinor - dbk.capturedMinor,
        paymentChoice: dbk.capturedMinor > 0 ? 'BANK_TRANSFER' : 'PAY_LATER',
        leadName: dbk.leadName,
        leadEmail: dbk.leadEmail,
        leadPhone: dbk.leadPhone,
        hotelName: 'Demo Resort Sharm (Fictional)',
        travelersJson: { adults: dbk.adults, children: dbk.children, infants: 0 },
        snapshotJson: {
          tourTitle: tour.title,
          tourSlug: tour.slug,
          departureDate: dep.departureDate,
          startTime: dep.startTime,
          timezone: dep.timezone,
          currency: 'USD',
          grandTotalMinor: dbk.totalMinor,
          policyTitle: standardPolicyV1.title,
          freeCancellationHours: standardPolicyV1.freeCancellationHours,
          partialRefundHours: standardPolicyV1.partialRefundHours,
          partialRefundPercentBps: standardPolicyV1.partialRefundPercentBps,
          lineItems: [
            {
              kind: 'BASE',
              label: `${tour.title} (${seats} travelers)`,
              quantity: seats,
              unitPriceMinor: Math.round(dbk.totalMinor / seats),
              totalMinor: dbk.totalMinor,
            },
          ],
        },
        policyVersionId: standardPolicyV1.id,
        acceptedPolicyAt: new Date(),
        qrCheckinTokenHash: sha256(`qr:${dbk.reference}:${crypto.randomBytes(8).toString('hex')}`),
        cancellationReason: dbk.status === 'CANCELLED' ? 'Demo guest changed travel dates' : null,
        cancelledAt: dbk.status === 'CANCELLED' ? new Date() : null,
      },
    });

    if (dbk.status === 'CONFIRMED') {
      await client.departure.update({
        where: { id: dep.id },
        data: { bookedSeats: { increment: seats } },
      });
    } else if (dbk.status === 'REQUESTED') {
      await client.departure.update({
        where: { id: dep.id },
        data: { heldSeats: { increment: seats } },
      });
    }

    if (dbk.capturedMinor > 0) {
      await client.paymentLedgerEntry.create({
        data: {
          bookingId: booking.id,
          type: 'MANUAL_PAYMENT',
          provider: 'BANK_TRANSFER',
          amountMinor: dbk.capturedMinor,
          currency: 'USD',
          externalRef: `DEMO-TX-${dbk.reference}`,
          reason: 'Demo verified bank transfer',
        },
      });
    }

    await client.bookingEvent.create({
      data: {
        bookingId: booking.id,
        actorType: 'SYSTEM',
        eventType: 'DEMO_SEED_CREATED',
        message: `Demo booking created in ${dbk.status} / ${dbk.paymentStatus} state`,
      },
    });
  }
}

if (require.main === module) {
  const forceDemo = process.argv.includes('--force-demo');
  const client = new PrismaClient();
  runDemoSeed(client, { forceDemo })
    .then(() => {
      console.log('Demo seed completed idempotently (5 destinations, 16 tours, rolling Cairo departures, CMS pages, sample bookings).');
    })
    .catch((err) => {
      console.error('Demo seed failed:', err);
      process.exitCode = 1;
    })
    .finally(() => client.$disconnect());
}
