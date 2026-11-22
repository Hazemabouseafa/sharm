import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
else dotenv.config();

import nodemailer from 'nodemailer';
import {
  PrismaClient,
  OutboxJob,
  PUBLIC_AUTO_TRANSLATE_TARGETS,
  completeOutboxJob,
  executeDueCmsPublishSchedules,
  expireOverdueBookings,
  failOutboxJob,
  leaseOutboxJobs,
  translateTextsWithCache,
} from '@sharm/database';
import { formatMinorUnitsExact } from '@sharm/contracts';

const WORKER_ID = `worker-${os.hostname()}-${process.pid}`;
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.WORKER_CONCURRENCY || 2)));
const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_INTERVAL_MS || 2000));
const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || 'http://127.0.0.1:3000';
const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET || '';

const prisma = new PrismaClient();

function createMailer() {
  const host = process.env.SMTP_HOST || '127.0.0.1';
  const port = Number(process.env.SMTP_PORT || 1025);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
  });
}

function renderEmailContent(payload: Record<string, unknown>, customTemplates: Record<string, { subject?: string; intro?: string }>) {
  const key = String(payload.templateKey || 'notification');
  const ref = String(payload.reference || '');
  const leadName = String(payload.leadName || payload.fullName || 'Traveler');
  const tourTitle = String(payload.tourTitle || '');
  const depDate = String(payload.departureDate || '');
  const startTime = String(payload.startTime || '');
  const currency = String(payload.currency || 'USD');
  const totalFormatted =
    typeof payload.grandTotalMinor === 'number'
      ? formatMinorUnitsExact(payload.grandTotalMinor, currency)
      : '';
  const manageLink = payload.manageLink ? String(payload.manageLink) : '';
  const custom = customTemplates[key] ?? {};
  const interpolate = (tpl: string) => tpl.replace(/\{\{reference\}\}/g, ref).replace(/\{\{leadName\}\}/g, leadName);

  let subject = custom.subject ? interpolate(custom.subject) : `Sharm Pharaoh Travel — ${ref || 'Notification'}`;
  let intro = custom.intro ? interpolate(custom.intro) : '';
  let extraLines: string[] = [];

  switch (key) {
    case 'booking_requested':
      subject = custom.subject ? interpolate(custom.subject) : `Booking Request Received — ${ref} (Awaiting Confirmation)`;
      intro =
        custom.intro ||
        'Thank you for submitting your booking request with Sharm Pharaoh Travel. Your booking is NOT confirmed yet — our reservations team is verifying live availability.';
      extraLines = [
        `Booking Reference: ${ref}`,
        `Status: Booking request received — awaiting confirmation`,
        tourTitle ? `Tour: ${tourTitle}` : '',
        depDate ? `Departure: ${depDate} at ${startTime} (Africa/Cairo)` : '',
        totalFormatted ? `Total Quoted: ${totalFormatted}` : '',
        payload.deadlineIso ? `Seat Hold Review Deadline: ${payload.deadlineIso}` : '',
        manageLink ? `Secure Booking Access Link: ${manageLink}` : '',
      ];
      break;
    case 'booking_confirmed':
      subject = custom.subject ? interpolate(custom.subject) : `Booking Confirmed — ${ref} | Sharm Pharaoh Travel`;
      intro = custom.intro || 'Your reservation with Sharm Pharaoh Travel is confirmed! Download your official PDF voucher from your secure booking link.';
      extraLines = [
        `Booking Reference: ${ref}`,
        `Status: Confirmed`,
        tourTitle ? `Tour: ${tourTitle}` : '',
        depDate ? `Departure: ${depDate} at ${startTime} (Africa/Cairo)` : '',
        totalFormatted ? `Total: ${totalFormatted}` : '',
        manageLink ? `Download Voucher & Manage Booking: ${manageLink}` : '',
      ];
      break;
    case 'booking_cancelled':
      subject = `Booking Cancelled — ${ref} | Sharm Pharaoh Travel`;
      intro = `Your booking (${ref}) has been cancelled.`;
      extraLines = [
        payload.reason ? `Reason: ${payload.reason}` : '',
        typeof payload.eligibleRefundMinor === 'number' && payload.eligibleRefundMinor > 0
          ? `Eligible Refund Queued: ${formatMinorUnitsExact(payload.eligibleRefundMinor, currency)}`
          : '',
      ];
      break;
    case 'booking_expired':
      subject = `Booking Hold Expired — ${ref} | Sharm Pharaoh Travel`;
      intro = `Your temporary seat hold for booking ${ref} expired and the held seats were released.`;
      extraLines = [payload.reason ? `Details: ${payload.reason}` : ''];
      break;
    case 'booking_access_link':
      subject = `Your Secure Booking Access Link — ${ref}`;
      intro = 'Use the private link below to view your booking status, upload transfer proof, or download your voucher.';
      extraLines = [manageLink ? `Manage Booking: ${manageLink}` : ''];
      break;
    case 'staff_password_reset':
      subject = 'Reset Your Sharm Pharaoh Admin Password';
      intro = `A password reset was requested for your staff account. This link expires in ${payload.expiresMinutes ?? 30} minutes.`;
      extraLines = [payload.resetUrl ? `Reset Password: ${payload.resetUrl}` : ''];
      break;
    case 'inquiry_received':
      subject = 'We received your travel inquiry — Sharm Pharaoh Travel';
      intro = `Hello ${leadName}, thank you for contacting Sharm Pharaoh Travel. Our advisors have received your message and will reply shortly.`;
      extraLines = [
        payload.destinationSlug ? `Destination of interest: ${payload.destinationSlug}` : '',
      ];
      break;
    case 'inquiry_staff_alert':
      subject = `New Travel Inquiry from ${leadName}`;
      intro = `A traveler submitted an inquiry through the website.`;
      extraLines = [
        `From: ${leadName} <${payload.guestEmail}>`,
        payload.phone ? `Phone: ${payload.phone}` : '',
        payload.destinationSlug ? `Destination: ${payload.destinationSlug}` : '',
        `Message: ${payload.message}`,
      ];
      break;
    case 'staff_paid_unfulfilled_alert':
      subject = `[URGENT] Paid-But-Unfulfilled Booking Exception — ${ref}`;
      intro = `A verified payment arrived after hold expiry when departure capacity was no longer available. An automatic refund request (${payload.refundRequestId}) has been queued.`;
      extraLines = [`Booking Reference: ${ref}`];
      break;
    default:
      intro = String(payload.message || 'Operational notification from Sharm Pharaoh Travel.');
  }

  const lines = extraLines.filter(Boolean);
  const text = [`Hello ${leadName},`, '', intro, '', ...lines, '', '— Sharm Pharaoh Travel'].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Inter,Arial,sans-serif;background:#F7F5EF;padding:24px;color:#103D45"><div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E5E0D5"><div style="background:#103D45;color:#FFFFFF;padding:20px 24px"><strong style="letter-spacing:1.5px;font-size:18px">SHARM PHARAOH</strong><div style="color:#C9A66B;font-size:11px;letter-spacing:4px">TRAVEL</div></div><div style="padding:24px"><p>Hello ${leadName},</p><p>${intro}</p>${lines.length ? `<ul style="padding-left:18px;line-height:1.7">${lines.map((l) => `<li>${l.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''}<p style="color:#64748B;font-size:12px;margin-top:24px">Sharm Pharaoh Travel — Curated Red Sea &amp; Heritage Journeys</p></div></div></body></html>`;
  return { subject, text, html };
}

export async function processSingleJob(client: PrismaClient, job: OutboxJob): Promise<void> {
  const payload = (job.payloadJson ?? {}) as Record<string, unknown>;

  if (job.jobType === 'SEND_EMAIL') {
    const toEmail = String(payload.toEmail || '').trim();
    if (!toEmail) return;

    // Prevent duplicate sent confirmations on retry
    const alreadySent = await client.emailDelivery.findFirst({
      where: { jobId: job.id, status: 'SENT' },
    });
    if (alreadySent) return;

    const settings = await client.siteSetting.findUnique({ where: { key: 'singleton' } });
    const customTemplates = (settings?.emailTemplatesJson ?? {}) as Record<string, { subject?: string; intro?: string }>;
    const { subject, text, html } = renderEmailContent(payload, customTemplates);

    const delivery = await client.emailDelivery.create({
      data: {
        jobId: job.id,
        toEmail,
        templateKey: String(payload.templateKey || 'generic'),
        subject,
        status: 'QUEUED',
        bookingId: payload.bookingId ? String(payload.bookingId) : null,
      },
    });

    try {
      const mailer = createMailer();
      const info = await mailer.sendMail({
        from: process.env.EMAIL_FROM || 'Sharm Pharaoh Travel <noreply@sharmpharaoh.example>',
        to: toEmail,
        subject,
        text,
        html,
      });

      await client.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          providerMessageId: info.messageId || null,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      await client.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message.slice(0, 1000) : 'SMTP delivery failed',
        },
      });
      throw err;
    }
    return;
  }

  if (job.jobType === 'TRIGGER_REVALIDATION') {
    if (!REVALIDATION_SECRET) return;
    const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidation-secret': REVALIDATION_SECRET,
      },
      body: JSON.stringify({
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        paths: Array.isArray(payload.paths) ? payload.paths : [],
      }),
    });
    if (!res.ok) {
      throw new Error(`Revalidation endpoint returned HTTP ${res.status}`);
    }
    return;
  }

  if (job.jobType === 'EXPIRE_HOLDS') {
    await expireOverdueBookings(client, new Date());
    return;
  }

  if (job.jobType === 'PUBLISH_SCHEDULED_CMS') {
    await executeDueCmsPublishSchedules(client, new Date());
    return;
  }

  if (job.jobType === 'PRETRANSLATE_CONTENT') {
    const rawTexts = Array.isArray(payload.texts) ? payload.texts : [];
    const texts = rawTexts.filter((t): t is string => typeof t === 'string' && t.trim().length >= 2).slice(0, 120);
    if (texts.length === 0) return;
    const targets = [...PUBLIC_AUTO_TRANSLATE_TARGETS, 'en' as const];
    for (const lang of targets) {
      await translateTextsWithCache(client, texts, lang);
    }
    return;
  }
}

export async function runWorkerTick(client: PrismaClient = prisma): Promise<{ processed: number; failed: number }> {
  // Periodic sweeps for overdue holds/requests and due CMS schedules
  await expireOverdueBookings(client, new Date());
  await executeDueCmsPublishSchedules(client, new Date());

  const leased = await leaseOutboxJobs(client, WORKER_ID, CONCURRENCY, 60);
  let processed = 0;
  let failed = 0;

  await Promise.all(
    leased.map(async (job) => {
      try {
        await processSingleJob(client, job);
        await completeOutboxJob(client, job.id);
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await failOutboxJob(client, job, msg);
        failed++;
        console.error(`[worker] Job ${job.id} (${job.jobType}) failed (attempt ${job.attempts}/${job.maxAttempts}): ${msg}`);
      }
    }),
  );

  return { processed, failed };
}

async function main() {
  let shuttingDown = false;
  console.log(`[worker] Starting durable PostgreSQL worker ${WORKER_ID} (concurrency=${CONCURRENCY}, pollMs=${POLL_MS})`);

  const shutdown = () => {
    console.log(`[worker] Graceful shutdown requested...`);
    shuttingDown = true;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!shuttingDown) {
    try {
      const res = await runWorkerTick(prisma);
      if (res.processed > 0 || res.failed > 0) {
        console.log(`[worker] Tick processed=${res.processed} failed=${res.failed}`);
      }
    } catch (err) {
      console.error('[worker] Tick error:', err instanceof Error ? err.message : err);
    }
    if (!shuttingDown) {
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  await prisma.$disconnect();
  console.log('[worker] Shutdown complete.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] Fatal error:', err);
    process.exit(1);
  });
}
