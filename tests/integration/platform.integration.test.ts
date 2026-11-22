import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaClient,
  assertDisposableTestDatabase,
  expireOverdueBookings,
  leaseOutboxJobs,
  runDemoSeed,
} from '@sharm/database';
import { createConfiguredApiApp } from '@sharm/api/app-factory';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:55432/sharm_pharaoh_test?schema=public';
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test_session_secret_32_characters_minimum_12345';
process.env.CSRF_SECRET = 'test_csrf_secret_32_characters_minimum_1234567';
process.env.PREVIEW_TOKEN_SECRET = 'test_preview_secret_32_characters_minimum_123';
process.env.GUEST_TOKEN_PEPPER = 'test_guest_token_pepper_32_characters_min_123';
process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.PAYMOB_HMAC_SECRET = 'paymob_test_hmac_secret_key_for_integration';
process.env.PAYMOB_SECRET_KEY = 'paymob_test_secret_key_for_local_webhook_tests';
process.env.STORAGE_PUBLIC_DIR = path.resolve(__dirname, '../../.local-storage/test-public');
process.env.STORAGE_PRIVATE_DIR = path.resolve(__dirname, '../../.local-storage/test-private');

function computePaymobHmac(secret: string, obj: Record<string, unknown>): string {
  const order = (obj.order ?? {}) as Record<string, unknown>;
  const sourceData = (obj.source_data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const concatenated = [
    str(obj.amount_cents),
    str(obj.created_at),
    str(obj.currency),
    str(obj.error_occured),
    str(obj.has_parent_transaction),
    str(obj.id),
    str(obj.integration_id),
    str(obj.is_3d_secure),
    str(obj.is_auth),
    str(obj.is_capture),
    str(obj.is_refunded),
    str(obj.is_standalone_payment),
    str(obj.is_voided),
    str(order.id),
    str(obj.owner),
    str(obj.pending),
    str(sourceData.pan),
    str(sourceData.sub_type),
    str(sourceData.type),
    str(obj.success),
  ].join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

describe('Sharm Pharaoh Travel — Full PostgreSQL Integration Suite', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof createConfiguredApiApp>>;
  let server: unknown;
  let validPngBuffer: Buffer;

  let ownerCookie = '';
  let ownerCsrf = '';
  let editorCookie = '';
  let editorCsrf = '';
  let financeCookie = '';
  let financeCsrf = '';
  let agentCookie = '';
  let agentCsrf = '';

  beforeAll(async () => {
    assertDisposableTestDatabase(testDbUrl);
    fs.mkdirSync(process.env.STORAGE_PUBLIC_DIR!, { recursive: true });
    fs.mkdirSync(process.env.STORAGE_PRIVATE_DIR!, { recursive: true });

    validPngBuffer = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: { r: 24, g: 165, b: 160 },
      },
    })
      .png()
      .toBuffer();

    prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "EmailDelivery",
        "OutboxJob",
        "AuditLog",
        "PaymentWebhookEvent",
        "RefundRequest",
        "PaymentLedgerEntry",
        "PaymentProof",
        "PaymentAttempt",
        "BookingNote",
        "BookingEvent",
        "GuestAccessToken",
        "Booking",
        "BookingQuote",
        "IdempotencyRecord",
        "PromotionRedemption",
        "StaffSession",
        "StaffRecoveryCode",
        "PasswordResetToken",
        "StaffUser"
      RESTART IDENTITY CASCADE;
    `);

    await runDemoSeed(prisma, { forceDemo: true });

    await prisma.siteSetting.update({
      where: { key: 'singleton' },
      data: {
        payLaterEnabled: true,
        bankTransferEnabled: true,
        paymobNonSecretConfigJson: {
          enabled: true,
          sandboxVerified: true,
          currency: 'USD',
          integrationId: '12345',
          callbackUrl: 'http://localhost:4000/api/v1/webhooks/paymob',
        },
      },
    });

    app = await createConfiguredApiApp();
    await app.init();
    server = app.getHttpServer();

    const argon2 = await import('argon2');
    const pwdHash = await argon2.default.hash('OwnerStrongPass!2026', {
      type: argon2.default.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await prisma.staffUser.create({
      data: {
        email: 'owner@sharmpharaoh.com',
        fullName: 'Test Owner',
        role: 'OWNER',
        passwordHash: pwdHash,
        isActive: true,
      },
    });

    const loginRes = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'owner@sharmpharaoh.com', password: 'OwnerStrongPass!2026' })
      .expect(201);

    ownerCookie = (loginRes.headers['set-cookie'] as string[])[0].split(';')[0];
    ownerCsrf = loginRes.body.csrfToken;

    for (const staffSpec of [
      { email: 'editor@sharmpharaoh.com', fullName: 'Content Editor', role: 'CONTENT_EDITOR' },
      { email: 'finance@sharmpharaoh.com', fullName: 'Finance Officer', role: 'FINANCE' },
      { email: 'agent@sharmpharaoh.com', fullName: 'Reservations Agent', role: 'RESERVATIONS_AGENT' },
    ] as const) {
      await request(server)
        .post('/api/v1/admin/team')
        .set('Cookie', ownerCookie)
        .set('x-csrf-token', ownerCsrf)
        .send({
          email: staffSpec.email,
          fullName: staffSpec.fullName,
          role: staffSpec.role,
          password: 'StaffPassword!2026',
        })
        .expect(201);
    }

    const editorLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'editor@sharmpharaoh.com', password: 'StaffPassword!2026' })
      .expect(201);
    editorCookie = (editorLogin.headers['set-cookie'] as string[])[0].split(';')[0];
    editorCsrf = editorLogin.body.csrfToken;

    const financeLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'finance@sharmpharaoh.com', password: 'StaffPassword!2026' })
      .expect(201);
    financeCookie = (financeLogin.headers['set-cookie'] as string[])[0].split(';')[0];
    financeCsrf = financeLogin.body.csrfToken;

    const agentLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'agent@sharmpharaoh.com', password: 'StaffPassword!2026' })
      .expect(201);
    agentCookie = (agentLogin.headers['set-cookie'] as string[])[0].split(';')[0];
    agentCsrf = agentLogin.body.csrfToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('DATA-01: assertDisposableTestDatabase blocks non-test databases', () => {
    expect(() =>
      assertDisposableTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/sharm_pharaoh_prod'),
    ).toThrow(/test/i);
  });

  it('BOOK-01 & BOOK-02: end-to-end guest Pay Later booking, immutable snapshot, token exchange, reference-only rejection, staff approve, and PDF voucher', async () => {
    const tour = await prisma.tour.findFirstOrThrow({
      where: { status: 'PUBLISHED', pricingMode: 'PER_PERSON', instantConfirmPayLater: false },
      include: {
        departures: {
          where: { status: 'OPEN', departureDate: { gte: '2026-11-25' } },
          orderBy: { departureDate: 'asc' },
          take: 1,
        },
      },
    });
    const departure = tour.departures[0];
    expect(departure).toBeDefined();
    const initialHeld = departure.heldSeats;
    const initialBooked = departure.bookedSeats;

    // 1. Create server quote
    const quoteRes = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: departure.id,
        adults: 2,
        children: 1,
        infants: 1,
        addons: [],
        paymentChoice: 'PAY_LATER',
      })
      .expect(201);

    expect(quoteRes.body.quoteId).toBeDefined();
    expect(quoteRes.body.quote.seatsRequired).toBe(3);

    // 2. Create booking with Idempotency-Key
    const idemKey = `idem-book01-${crypto.randomUUID()}`;
    const bookingPayload = {
      quoteId: quoteRes.body.quoteId,
      expectedGrandTotalMinor: quoteRes.body.quote.grandTotalMinor,
      expectedCurrency: quoteRes.body.quote.currency,
      expectedPricingVersion: quoteRes.body.quote.pricingVersion,
      leadName: 'Eleanor Vance',
      leadEmail: 'eleanor.vance@example.com',
      leadPhone: '+447700900123',
      nationality: 'United Kingdom',
      hotelName: 'Four Seasons Resort Sharm El Sheikh',
      specialRequests: 'Vegetarian lunch option please',
      acceptedPolicyVersionId: quoteRes.body.policy.versionId,
      acceptedPolicyAtClient: true,
      paymentChoice: 'PAY_LATER',
    };

    const bookingRes = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', idemKey)
      .send(bookingPayload)
      .expect(201);

    expect(bookingRes.body.reference).toMatch(/^SPT-/);
    expect(bookingRes.body.status).toBe('REQUESTED');
    expect(bookingRes.body.paymentStatus).toBe('UNPAID');
    expect(bookingRes.body.manageExchangeToken).toBeDefined();

    // Verify heldSeats increased by 3
    const depAfterCreate = await prisma.departure.findUniqueOrThrow({ where: { id: departure.id } });
    expect(depAfterCreate.heldSeats).toBe(initialHeld + 3);

    // 3. Edit tour pricingVersion after booking creation and verify booking snapshot remains frozen
    const originalTitle = tour.title;
    await prisma.tour.update({
      where: { id: tour.id },
      data: { title: 'Mutated Future Title', pricingVersion: { increment: 1 } },
    });

    const storedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingRes.body.bookingId } });
    expect(storedBooking.grandTotalMinor).toBe(quoteRes.body.quote.grandTotalMinor);
    expect((storedBooking.snapshotJson as { tourTitle: string }).tourTitle).toBe(originalTitle);

    await prisma.tour.update({
      where: { id: tour.id },
      data: { title: originalTitle, pricingVersion: { decrement: 1 } },
    });

    // 4. Verify reference-only access without manage session cookie is rejected (401)
    await request(server).get('/api/v1/public/booking-access/current').expect(401);

    // 5. Exchange opaque manageExchangeToken for HttpOnly session cookie
    const exchangeRes = await request(server)
      .post('/api/v1/public/booking-access/exchange')
      .send({ token: bookingRes.body.manageExchangeToken })
      .expect(201);

    const guestCookie = (exchangeRes.headers['set-cookie'] as string[])[0].split(';')[0];
    expect(guestCookie).toContain('spt_guest_session=');

    const guestView = await request(server)
      .get('/api/v1/public/booking-access/current')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(guestView.body.reference).toBe(bookingRes.body.reference);
    expect(guestView.body.status).toBe('REQUESTED');

    // 6. Download PDF while REQUESTED (Request Summary PDF)
    const pdfReqRes = await request(server)
      .get('/api/v1/public/booking-access/voucher.pdf')
      .set('Cookie', guestCookie)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdfReqRes.body as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // 7. Staff approves booking -> heldSeats transitions to bookedSeats and status becomes CONFIRMED
    await request(server)
      .post(`/api/v1/admin/bookings/${bookingRes.body.bookingId}/approve`)
      .set('Cookie', agentCookie)
      .set('x-csrf-token', agentCsrf)
      .expect(201);

    const depAfterApprove = await prisma.departure.findUniqueOrThrow({ where: { id: departure.id } });
    expect(depAfterApprove.heldSeats).toBe(initialHeld);
    expect(depAfterApprove.bookedSeats).toBe(initialBooked + 3);

    const guestViewConfirmed = await request(server)
      .get('/api/v1/public/booking-access/current')
      .set('Cookie', guestCookie)
      .expect(200);
    expect(guestViewConfirmed.body.status).toBe('CONFIRMED');
  });

  it('BOOK-03: 20 simultaneous booking requests against a 5-seat departure never overbook capacity', async () => {
    const tour = await prisma.tour.findFirstOrThrow({
      where: { status: 'PUBLISHED', pricingMode: 'PER_PERSON' },
    });

    const concurrencyDeparture = await prisma.departure.create({
      data: {
        tourId: tour.id,
        departureDate: '2027-03-15',
        startTime: '09:00',
        startUtc: new Date('2027-03-15T07:00:00.000Z'),
        capacity: 5,
        bookedSeats: 0,
        heldSeats: 0,
        status: 'OPEN',
      },
    });

    const quotes: Array<{
      quoteId: string;
      grandTotalMinor: number;
      currency: string;
      pricingVersion: number;
      policyVersionId: string;
    }> = [];

    for (let i = 0; i < 20; i += 1) {
      const qRes = await request(server)
        .post('/api/v1/public/quotes')
        .send({
          tourId: tour.id,
          departureId: concurrencyDeparture.id,
          adults: 1,
          children: 0,
          infants: 0,
          addons: [],
          paymentChoice: 'PAY_LATER',
        })
        .expect(201);
      quotes.push({
        quoteId: qRes.body.quoteId,
        grandTotalMinor: qRes.body.quote.grandTotalMinor,
        currency: qRes.body.quote.currency,
        pricingVersion: qRes.body.quote.pricingVersion,
        policyVersionId: qRes.body.policy.versionId,
      });
    }

    const responses = await Promise.all(
      quotes.map((q, idx) =>
        request(server)
          .post('/api/v1/public/bookings')
          .set('Idempotency-Key', `conc-20-vs-5-${idx}-${crypto.randomUUID()}`)
          .send({
            quoteId: q.quoteId,
            expectedGrandTotalMinor: q.grandTotalMinor,
            expectedCurrency: q.currency,
            expectedPricingVersion: q.pricingVersion,
            leadName: `Concurrent Guest ${idx}`,
            leadEmail: `concurrent.${idx}@example.com`,
            leadPhone: '+201001234567',
            nationality: 'Egypt',
            acceptedPolicyVersionId: q.policyVersionId,
            acceptedPolicyAtClient: true,
            paymentChoice: 'PAY_LATER',
          }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(succeeded.length).toBe(5);
    expect(conflicts.length).toBe(15);
    for (const conflictRes of conflicts) {
      expect(conflictRes.body.error.code).toBe('CAPACITY_EXCEEDED');
    }

    const finalDeparture = await prisma.departure.findUniqueOrThrow({
      where: { id: concurrencyDeparture.id },
    });
    expect(finalDeparture.heldSeats + finalDeparture.bookedSeats).toBe(5);
    expect(finalDeparture.heldSeats + finalDeparture.bookedSeats).toBeLessThanOrEqual(finalDeparture.capacity);
  });

  it('BOOK-04: idempotency retry with identical payload returns same booking; different payload with same key returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const tour = await prisma.tour.findFirstOrThrow({
      where: { status: 'PUBLISHED', pricingMode: 'PER_PERSON' },
      include: {
        departures: {
          where: { status: 'OPEN', departureDate: { gte: '2026-12-01' } },
          take: 1,
        },
      },
    });
    const dep = tour.departures[0];

    const qRes = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: dep.id,
        adults: 1,
        children: 0,
        infants: 0,
        addons: [],
        paymentChoice: 'PAY_LATER',
      })
      .expect(201);

    const idemKey = `idem-test-${crypto.randomUUID()}`;
    const payload = {
      quoteId: qRes.body.quoteId,
      expectedGrandTotalMinor: qRes.body.quote.grandTotalMinor,
      expectedCurrency: qRes.body.quote.currency,
      expectedPricingVersion: qRes.body.quote.pricingVersion,
      leadName: 'Idempotent Traveler',
      leadEmail: 'idem@example.com',
      leadPhone: '+12025550199',
      nationality: 'United States',
      acceptedPolicyVersionId: qRes.body.policy.versionId,
      acceptedPolicyAtClient: true,
      paymentChoice: 'PAY_LATER',
    };

    const first = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', idemKey)
      .send(payload)
      .expect(201);

    const depAfterFirst = await prisma.departure.findUniqueOrThrow({ where: { id: dep.id } });

    const second = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', idemKey)
      .send(payload)
      .expect(201);

    expect(second.body.bookingId).toBe(first.body.bookingId);
    expect(second.body.reference).toBe(first.body.reference);

    const depAfterSecond = await prisma.departure.findUniqueOrThrow({ where: { id: dep.id } });
    expect(depAfterSecond.heldSeats).toBe(depAfterFirst.heldSeats);

    const conflict = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', idemKey)
      .send({ ...payload, leadEmail: 'mutated.email@example.com' })
      .expect(409);

    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('BOOK-05 & BOOK-06: hold expiration releases seats, stale outbox leases recover, capacity reduction below allocated seats is blocked, and reschedule moves seats atomically', async () => {
    const tour = await prisma.tour.findFirstOrThrow({
      where: { status: 'PUBLISHED', pricingMode: 'PER_PERSON', instantConfirmPayLater: false },
    });

    const depA = await prisma.departure.create({
      data: {
        tourId: tour.id,
        departureDate: '2027-04-10',
        startTime: '08:00',
        startUtc: new Date('2027-04-10T06:00:00.000Z'),
        capacity: 10,
        bookedSeats: 0,
        heldSeats: 0,
        status: 'OPEN',
      },
    });

    const depB = await prisma.departure.create({
      data: {
        tourId: tour.id,
        departureDate: '2027-04-11',
        startTime: '08:00',
        startUtc: new Date('2027-04-11T06:00:00.000Z'),
        capacity: 10,
        bookedSeats: 0,
        heldSeats: 0,
        status: 'OPEN',
      },
    });

    const qRes = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: depA.id,
        adults: 2,
        children: 0,
        infants: 0,
        addons: [],
        paymentChoice: 'PAY_LATER',
      })
      .expect(201);

    const bRes = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', `idem-exp-${crypto.randomUUID()}`)
      .send({
        quoteId: qRes.body.quoteId,
        expectedGrandTotalMinor: qRes.body.quote.grandTotalMinor,
        expectedCurrency: qRes.body.quote.currency,
        expectedPricingVersion: qRes.body.quote.pricingVersion,
        leadName: 'Expiry Guest',
        leadEmail: 'expiry@example.com',
        leadPhone: '+201009998877',
        nationality: 'Germany',
        acceptedPolicyVersionId: qRes.body.policy.versionId,
        acceptedPolicyAtClient: true,
        paymentChoice: 'PAY_LATER',
      })
      .expect(201);

    // Attempt to reduce depA capacity to 1 while 2 seats are held -> rejected (409)
    await request(server)
      .patch(`/api/v1/admin/availability/departures/${depA.id}`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ capacity: 1 })
      .expect(409);

    // Transactional reschedule from depA to depB
    await request(server)
      .post(`/api/v1/admin/bookings/${bRes.body.bookingId}/reschedule`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ newDepartureId: depB.id, acceptPriceDifference: true, reason: 'Guest requested next day' })
      .expect(201);

    const depAAfterResched = await prisma.departure.findUniqueOrThrow({ where: { id: depA.id } });
    const depBAfterResched = await prisma.departure.findUniqueOrThrow({ where: { id: depB.id } });
    expect(depAAfterResched.heldSeats).toBe(0);
    expect(depBAfterResched.heldSeats).toBe(2);

    // Force decisionDeadlineAt into the past and run expireOverdueBookings
    await prisma.booking.update({
      where: { id: bRes.body.bookingId },
      data: { decisionDeadlineAt: new Date(Date.now() - 60_000) },
    });

    const expiredResult = await expireOverdueBookings(prisma, new Date());
    expect(expiredResult.expiredRequestIds).toContain(bRes.body.bookingId);

    const depBAfterExpiry = await prisma.departure.findUniqueOrThrow({ where: { id: depB.id } });
    expect(depBAfterExpiry.heldSeats).toBe(0);

    // Stale outbox lease recovery test
    const staleJob = await prisma.outboxJob.create({
      data: {
        jobType: 'SEND_EMAIL',
        payloadJson: { test: true },
        status: 'LEASED',
        leasedBy: 'crashed-worker',
        runAfterUtc: new Date(Date.now() - 3600_000),
        leasedUntilUtc: new Date(Date.now() - 120_000),
      },
    });
    const reclaimedJobs = await leaseOutboxJobs(prisma, 'recovery-worker', 10, 60);
    expect(reclaimedJobs.some((j) => j.id === staleJob.id)).toBe(true);
    const recoveredJob = await prisma.outboxJob.findUniqueOrThrow({ where: { id: staleJob.id } });
    expect(recoveredJob.leasedBy).toBe('recovery-worker');
  });

  it('PAY-01 & PAY-02: manual transfer proof upload never auto-marks PAID; staff VERIFY confirms booking; Paymob HMAC verification, replay deduplication, out-of-order FAILED protection, and late-payment-after-expiry reacquisition & OVERPAYMENT_EXCEPTION', async () => {
    const tour = await prisma.tour.findFirstOrThrow({
      where: { status: 'PUBLISHED', pricingMode: 'PER_PERSON', instantConfirmPayLater: false },
    });

    const dep = await prisma.departure.create({
      data: {
        tourId: tour.id,
        departureDate: '2027-05-20',
        startTime: '08:30',
        startUtc: new Date('2027-05-20T05:30:00.000Z'),
        capacity: 4,
        bookedSeats: 0,
        heldSeats: 0,
        status: 'OPEN',
      },
    });

    // 1. Create BANK_TRANSFER booking (2 seats)
    const q1 = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: dep.id,
        adults: 2,
        children: 0,
        infants: 0,
        addons: [],
        paymentChoice: 'BANK_TRANSFER',
      })
      .expect(201);

    const b1 = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', `idem-pay01-${crypto.randomUUID()}`)
      .send({
        quoteId: q1.body.quoteId,
        expectedGrandTotalMinor: q1.body.quote.grandTotalMinor,
        expectedCurrency: q1.body.quote.currency,
        expectedPricingVersion: q1.body.quote.pricingVersion,
        leadName: 'Bank Transfer Guest',
        leadEmail: 'transfer@example.com',
        leadPhone: '+447700900555',
        nationality: 'United Kingdom',
        acceptedPolicyVersionId: q1.body.policy.versionId,
        acceptedPolicyAtClient: true,
        paymentChoice: 'BANK_TRANSFER',
      })
      .expect(201);

    const ex1 = await request(server)
      .post('/api/v1/public/booking-access/exchange')
      .send({ token: b1.body.manageExchangeToken })
      .expect(201);
    const guest1Cookie = (ex1.headers['set-cookie'] as string[])[0].split(';')[0];

    // Upload bank transfer proof -> must set paymentStatus to PENDING, never PAID
    const proofRes = await request(server)
      .post('/api/v1/public/booking-access/payment-proofs')
      .set('Cookie', guest1Cookie)
      .field('submittedAmountMinor', String(q1.body.quote.grandTotalMinor))
      .field('submittedCurrency', 'USD')
      .field('transferReference', 'HSBC-TRX-998877')
      .field('note', 'Full wire transfer')
      .attach('file', validPngBuffer, 'receipt.png')
      .expect(201);

    expect(proofRes.body.status).toBe('PENDING_REVIEW');
    const b1AfterUpload = await prisma.booking.findUniqueOrThrow({ where: { id: b1.body.bookingId } });
    expect(b1AfterUpload.paymentStatus).toBe('PENDING');
    expect(b1AfterUpload.status).not.toBe('CONFIRMED');

    // Staff FINANCE reviews and verifies the proof
    await request(server)
      .post(`/api/v1/admin/payments/proofs/${proofRes.body.id}/review`)
      .set('Cookie', financeCookie)
      .set('x-csrf-token', financeCsrf)
      .send({
        decision: 'VERIFY',
        verifiedAmountMinor: q1.body.quote.grandTotalMinor,
        verifiedCurrency: 'USD',
        confirmBookingIfEligible: true,
        reviewNote: 'Verified on HSBC statement',
      })
      .expect(201);

    const b1AfterVerify = await prisma.booking.findUniqueOrThrow({ where: { id: b1.body.bookingId } });
    expect(b1AfterVerify.paymentStatus).toBe('PAID');
    expect(b1AfterVerify.status).toBe('CONFIRMED');

    // 2. Paymob Webhook HMAC + Late payment after hold expiry (Case A: seats available -> reacquires seats & confirms)
    const q2 = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: dep.id,
        adults: 1,
        children: 0,
        infants: 0,
        addons: [],
        paymentChoice: 'ONLINE_FULL',
      })
      .expect(201);

    const b2 = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', `idem-pay02-${crypto.randomUUID()}`)
      .send({
        quoteId: q2.body.quoteId,
        expectedGrandTotalMinor: q2.body.quote.grandTotalMinor,
        expectedCurrency: q2.body.quote.currency,
        expectedPricingVersion: q2.body.quote.pricingVersion,
        leadName: 'Paymob Late Guest',
        leadEmail: 'paymob.late@example.com',
        leadPhone: '+201011122233',
        nationality: 'Egypt',
        acceptedPolicyVersionId: q2.body.policy.versionId,
        acceptedPolicyAtClient: true,
        paymentChoice: 'ONLINE_FULL',
      })
      .expect(201);

    const attempt2 = await prisma.paymentAttempt.create({
      data: {
        bookingId: b2.body.bookingId,
        provider: 'PAYMOB',
        externalOrderId: `${b2.body.reference}-ord1`,
        amountMinor: q2.body.quote.grandTotalMinor,
        currency: 'USD',
        status: 'PENDING',
      },
    });

    // Expire b2's hold before the webhook arrives!
    await prisma.booking.update({
      where: { id: b2.body.bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await expireOverdueBookings(prisma, new Date());
    const b2Expired = await prisma.booking.findUniqueOrThrow({ where: { id: b2.body.bookingId } });
    expect(b2Expired.status).toBe('EXPIRED');
    expect(b2Expired.allocationActive).toBe(false);

    // Send Paymob webhook with INVALID HMAC -> 401
    const webhookObj2 = {
      id: 770001,
      amount_cents: q2.body.quote.grandTotalMinor,
      created_at: '2026-11-19T02:00:00',
      currency: 'USD',
      error_occured: false,
      has_parent_transaction: false,
      integration_id: 12345,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 9001, merchant_order_id: attempt2.externalOrderId },
      owner: 111,
      pending: false,
      source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
      success: true,
    };

    await request(server)
      .post('/api/v1/webhooks/paymob?hmac=forged_invalid_hmac_signature')
      .send({ obj: webhookObj2 })
      .expect(401);

    // Send Paymob webhook with VALID HMAC -> atomically reacquires 1 seat and confirms b2!
    const validHmac2 = computePaymobHmac(process.env.PAYMOB_HMAC_SECRET!, webhookObj2);
    const whRes2 = await request(server)
      .post(`/api/v1/webhooks/paymob?hmac=${validHmac2}`)
      .send({ obj: webhookObj2 })
      .expect(201);
    expect(whRes2.body.action).toBe('LATE_PAYMENT_REACQUIRED_AND_CONFIRMED');

    const b2Reacquired = await prisma.booking.findUniqueOrThrow({ where: { id: b2.body.bookingId } });
    expect(b2Reacquired.status).toBe('CONFIRMED');
    expect(b2Reacquired.paymentStatus).toBe('PAID');

    // Replay identical webhook -> deduplicated
    const replayRes = await request(server)
      .post(`/api/v1/webhooks/paymob?hmac=${validHmac2}`)
      .send({ obj: webhookObj2 })
      .expect(201);
    expect(replayRes.body.deduplicated).toBe(true);

    // Out-of-order FAILED webhook after PAID -> never rolls PAID booking backward
    const failedObj2 = { ...webhookObj2, id: 770002, success: false };
    const failedHmac2 = computePaymobHmac(process.env.PAYMOB_HMAC_SECRET!, failedObj2);
    await request(server)
      .post(`/api/v1/webhooks/paymob?hmac=${failedHmac2}`)
      .send({ obj: failedObj2 })
      .expect(201);

    const b2StillPaid = await prisma.booking.findUniqueOrThrow({ where: { id: b2.body.bookingId } });
    expect(b2StillPaid.paymentStatus).toBe('PAID');
    expect(b2StillPaid.status).toBe('CONFIRMED');

    // 3. Late payment after hold expiry when departure is SOLD OUT (Case B -> OVERPAYMENT_EXCEPTION + RefundRequest)
    const q3 = await request(server)
      .post('/api/v1/public/quotes')
      .send({
        tourId: tour.id,
        departureId: dep.id,
        adults: 1,
        children: 0,
        infants: 0,
        addons: [],
        paymentChoice: 'ONLINE_FULL',
      })
      .expect(201);

    const b3 = await request(server)
      .post('/api/v1/public/bookings')
      .set('Idempotency-Key', `idem-pay03-${crypto.randomUUID()}`)
      .send({
        quoteId: q3.body.quoteId,
        expectedGrandTotalMinor: q3.body.quote.grandTotalMinor,
        expectedCurrency: q3.body.quote.currency,
        expectedPricingVersion: q3.body.quote.pricingVersion,
        leadName: 'SoldOut Late Guest',
        leadEmail: 'soldout.late@example.com',
        leadPhone: '+201044455566',
        nationality: 'France',
        acceptedPolicyVersionId: q3.body.policy.versionId,
        acceptedPolicyAtClient: true,
        paymentChoice: 'ONLINE_FULL',
      })
      .expect(201);

    const attempt3 = await prisma.paymentAttempt.create({
      data: {
        bookingId: b3.body.bookingId,
        provider: 'PAYMOB',
        externalOrderId: `${b3.body.reference}-ord3`,
        amountMinor: q3.body.quote.grandTotalMinor,
        currency: 'USD',
        status: 'PENDING',
      },
    });

    await prisma.booking.update({
      where: { id: b3.body.bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await expireOverdueBookings(prisma, new Date());

    // Allocate the last seat on dep so 0 seats remain
    await prisma.departure.update({
      where: { id: dep.id },
      data: { bookedSeats: 4, heldSeats: 0, status: 'OPEN' },
    });

    const webhookObj3 = {
      ...webhookObj2,
      id: 770003,
      amount_cents: q3.body.quote.grandTotalMinor,
      order: { id: 9003, merchant_order_id: attempt3.externalOrderId },
      success: true,
    };
    const validHmac3 = computePaymobHmac(process.env.PAYMOB_HMAC_SECRET!, webhookObj3);
    const whRes3 = await request(server)
      .post(`/api/v1/webhooks/paymob?hmac=${validHmac3}`)
      .send({ obj: webhookObj3 })
      .expect(201);

    expect(whRes3.body.action).toBe('PAID_BUT_UNFULFILLED_REFUND_QUEUED');

    const b3AfterSoldOutLatePay = await prisma.booking.findUniqueOrThrow({
      where: { id: b3.body.bookingId },
      include: { refundRequests: true, ledgerEntries: true },
    });
    expect(b3AfterSoldOutLatePay.paidUnfulfilledFlag).toBe(true);
    expect(b3AfterSoldOutLatePay.status).toBe('EXPIRED');
    expect(b3AfterSoldOutLatePay.refundRequests.length).toBe(1);
    expect(b3AfterSoldOutLatePay.ledgerEntries.some((e) => e.type === 'OVERPAYMENT_EXCEPTION')).toBe(true);
  });

  it('CMS-01, CMS-02, CMS-03: Live Editor draft isolation, optimistic 409 VERSION_CONFLICT, signed preview verification, publish & rollback', async () => {
    const pagesRes = await request(server)
      .get('/api/v1/admin/cms/pages')
      .set('Cookie', editorCookie)
      .expect(200);

    const homeSummary = (pagesRes.body as Array<{ id: string; slug: string }>).find((p) => p.slug === 'home')!;
    expect(homeSummary).toBeDefined();

    const pageDetail = await request(server)
      .get(`/api/v1/admin/cms/pages/${homeSummary.id}`)
      .set('Cookie', editorCookie)
      .expect(200);

    const currentDraftVersion: number = pageDetail.body.currentDraft.version;
    const draftContent = structuredClone(pageDetail.body.currentDraft.contentJson);
    const originalHeading = draftContent.blocks[0].props.headline;
    draftContent.blocks[0].props.headline = 'DRAFT HEADING NOT YET LIVE';

    const save1 = await request(server)
      .put(`/api/v1/admin/cms/pages/${homeSummary.id}/draft`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({
        content: draftContent,
        expectedDraftVersion: currentDraftVersion,
        notes: 'Updated hero heading in draft',
      })
      .expect(200);

    expect(save1.body.draft.version).toBe(currentDraftVersion + 1);

    const pubBeforePublish = await request(server).get('/api/v1/public/cms/page?slug=home').expect(200);
    expect(pubBeforePublish.body.page.content.blocks[0].props.headline).toBe(originalHeading);

    const conflictRes = await request(server)
      .put(`/api/v1/admin/cms/pages/${homeSummary.id}/draft`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({
        content: draftContent,
        expectedDraftVersion: currentDraftVersion,
      })
      .expect(409);
    expect(conflictRes.body.error.code).toBe('VERSION_CONFLICT');

    await request(server).get('/api/v1/public/cms/preview?token=forged.token.value').expect(401);

    const previewLinkRes = await request(server)
      .post(`/api/v1/admin/cms/pages/${homeSummary.id}/preview-link`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({})
      .expect(201);

    const previewResolved = await request(server)
      .get(`/api/v1/public/cms/preview?token=${encodeURIComponent(previewLinkRes.body.token)}`)
      .expect(200);
    expect(previewResolved.body.page.content.blocks[0].props.headline).toBe('DRAFT HEADING NOT YET LIVE');

    const prePublishRevisionId = pageDetail.body.publishedRevisionId;
    await request(server)
      .post(`/api/v1/admin/cms/pages/${homeSummary.id}/publish`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({ notes: 'Publishing new hero heading' })
      .expect(201);

    const pubAfterPublish = await request(server).get('/api/v1/public/cms/page?slug=home').expect(200);
    expect(pubAfterPublish.body.page.content.blocks[0].props.headline).toBe('DRAFT HEADING NOT YET LIVE');

    await request(server)
      .post(`/api/v1/admin/cms/pages/${homeSummary.id}/rollback`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({ revisionId: prePublishRevisionId })
      .expect(201);

    const pubAfterRollback = await request(server).get('/api/v1/public/cms/page?slug=home').expect(200);
    expect(pubAfterRollback.body.page.content.blocks[0].props.headline).toBe(originalHeading);
  });

  it('ADMIN-01 & AUTH-01: server-side RBAC enforcement, CSRF validation, last-OWNER protection, session revocation on suspend, and TOTP 2FA + single-use recovery code', async () => {
    const proof = await prisma.paymentProof.findFirstOrThrow();
    const homePage = await prisma.cmsPage.findUniqueOrThrow({ where: { slug: 'home' } });

    await request(server)
      .get(`/api/v1/admin/media/${proof.mediaAssetId}/private`)
      .set('Cookie', editorCookie)
      .expect(403);

    await request(server)
      .post('/api/v1/admin/payments/refunds')
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .send({ bookingId: proof.bookingId, amountMinor: 1000, reason: 'Unauthorized attempt' })
      .expect(403);

    await request(server)
      .post(`/api/v1/admin/cms/pages/${homePage.id}/publish`)
      .set('Cookie', financeCookie)
      .set('x-csrf-token', financeCsrf)
      .send({ notes: 'Finance cannot publish CMS' })
      .expect(403);

    await request(server)
      .post('/api/v1/admin/team')
      .set('Cookie', agentCookie)
      .set('x-csrf-token', agentCsrf)
      .send({
        email: 'rogue@sharmpharaoh.com',
        fullName: 'Rogue User',
        role: 'READ_ONLY',
        password: 'StaffPassword!2026',
      })
      .expect(403);

    await request(server)
      .post(`/api/v1/admin/cms/pages/${homePage.id}/publish`)
      .set('Cookie', editorCookie)
      .send({ notes: 'Missing CSRF header' })
      .expect(403);

    const ownerUser = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@sharmpharaoh.com' } });
    await request(server)
      .patch(`/api/v1/admin/team/${ownerUser.id}`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ role: 'MANAGER' })
      .expect(409);

    await request(server)
      .patch(`/api/v1/admin/team/${ownerUser.id}`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ suspend: true })
      .expect(409);

    const tempStaffRes = await request(server)
      .post('/api/v1/admin/team')
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({
        email: 'temp.agent@sharmpharaoh.com',
        fullName: 'Temp Agent',
        role: 'READ_ONLY',
        password: 'StaffPassword!2026',
      })
      .expect(201);

    const tempLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'temp.agent@sharmpharaoh.com', password: 'StaffPassword!2026' })
      .expect(201);
    const tempCookie = (tempLogin.headers['set-cookie'] as string[])[0].split(';')[0];

    await request(server).get('/api/v1/admin/auth/me').set('Cookie', tempCookie).expect(200);

    await request(server)
      .patch(`/api/v1/admin/team/${tempStaffRes.body.id}`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ suspend: true })
      .expect(200);

    await request(server).get('/api/v1/admin/auth/me').set('Cookie', tempCookie).expect(401);

    const setup2fa = await request(server)
      .post('/api/v1/admin/auth/2fa/setup')
      .set('Cookie', financeCookie)
      .set('x-csrf-token', financeCsrf)
      .expect(201);

    const totpSecret: string = setup2fa.body.manualSecret;
    const validTotp = authenticator.generate(totpSecret);

    const enable2fa = await request(server)
      .post('/api/v1/admin/auth/2fa/enable')
      .set('Cookie', financeCookie)
      .set('x-csrf-token', financeCsrf)
      .send({ totpCode: validTotp })
      .expect(201);

    const recoveryCodes: string[] = enable2fa.body.recoveryCodes;
    expect(recoveryCodes.length).toBeGreaterThanOrEqual(8);

    const step1 = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'finance@sharmpharaoh.com', password: 'StaffPassword!2026' })
      .expect(201);
    expect(step1.body.requiresTwoFactor).toBe(true);

    const usedRecoveryCode = recoveryCodes[0];
    const recLogin1 = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({
        email: 'finance@sharmpharaoh.com',
        password: 'StaffPassword!2026',
        recoveryCode: usedRecoveryCode,
      })
      .expect(201);
    expect(recLogin1.body.user.email).toBe('finance@sharmpharaoh.com');

    await request(server)
      .post('/api/v1/admin/auth/login')
      .send({
        email: 'finance@sharmpharaoh.com',
        password: 'StaffPassword!2026',
        recoveryCode: usedRecoveryCode,
      })
      .expect(401);
  });

  it('MEDIA-01: magic-byte upload validation rejects disguised SVG/executable and blocks deleting in-use media without replacement', async () => {
    const disguisedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await request(server)
      .post('/api/v1/admin/media/upload')
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .attach('file', disguisedSvg, { filename: 'exploit.png', contentType: 'image/png' })
      .expect(400);

    const asset1Res = await request(server)
      .post('/api/v1/admin/media/upload')
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .field('altText', 'Red Sea Coral Reef 1')
      .attach('file', validPngBuffer, 'coral1.png')
      .expect(201);

    const asset2Res = await request(server)
      .post('/api/v1/admin/media/upload')
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .field('altText', 'Red Sea Coral Reef 2')
      .attach('file', validPngBuffer, 'coral2.png')
      .expect(201);

    const dest = await prisma.destination.findFirstOrThrow();
    await prisma.destination.update({
      where: { id: dest.id },
      data: { heroMediaId: asset1Res.body.id },
    });

    const delConflict = await request(server)
      .delete(`/api/v1/admin/media/${asset1Res.body.id}`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .expect(409);
    expect(delConflict.body.error.code).toBe('RESOURCE_IN_USE');

    await request(server)
      .delete(`/api/v1/admin/media/${asset1Res.body.id}?replacementMediaId=${asset2Res.body.id}`)
      .set('Cookie', editorCookie)
      .set('x-csrf-token', editorCsrf)
      .expect(200);

    const destAfterReplace = await prisma.destination.findUniqueOrThrow({ where: { id: dest.id } });
    expect(destAfterReplace.heroMediaId).toBe(asset2Res.body.id);
  });
});
