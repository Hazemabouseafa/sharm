import fs from 'fs';
import path from 'path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatMinorUnitsExact } from '@sharm/contracts';

export interface VoucherBookingData {
  reference: string;
  status: string;
  paymentStatus: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  hotelName?: string | null;
  meetingNotes?: string | null;
  specialRequests?: string | null;
  seatsAllocated: number;
  currency: string;
  grandTotalMinor: number;
  dueNowMinor: number;
  dueLaterMinor: number;
  collectedMinor: number;
  snapshot: {
    tourTitle: string;
    departureDate: string;
    startTime: string;
    timezone: string;
    meetingPoint?: string;
    policyTitle?: string;
    lineItems?: Array<{ label: string; quantity: number; totalMinor: number }>;
  };
  qrCheckinPayload?: string; // Opaque unguessable check-in token (NO PII inside QR!)
}

@Injectable()
export class VoucherService {
  private findLogoPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'apps/web/public/brand/logo-normal.png'),
      path.resolve(process.cwd(), '../web/public/brand/logo-normal.png'),
      path.resolve(__dirname, '../../../../web/public/brand/logo-normal.png'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  async generateBookingPdf(data: VoucherBookingData): Promise<Buffer> {
    const isConfirmed = data.status === 'CONFIRMED' || data.status === 'COMPLETED';
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>(async (resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header band in Deep Petrol #103D45
      doc.rect(0, 0, doc.page.width, 96).fill('#103D45');

      const logoPath = this.findLogoPath();
      if (logoPath) {
        try {
          doc.rect(42, 16, 68, 64).fill('#F7F5EF');
          doc.image(logoPath, 46, 20, { fit: [60, 56], align: 'center', valign: 'center' });
        } catch {
          // Fallback to text title if image load fails
        }
      }

      doc
        .fillColor('#FFFFFF')
        .fontSize(20)
        .text('SHARM PHARAOH TRAVEL', 124, 26);
      doc
        .fillColor('#C9A66B')
        .fontSize(11)
        .text(
          isConfirmed
            ? 'OFFICIAL BOOKING VOUCHER'
            : 'BOOKING REQUEST SUMMARY — AWAITING CONFIRMATION (NOT A VOUCHER)',
          124,
          54,
        );

      doc.moveDown(3.2);

      // Honest status notice banner
      const bannerColor = isConfirmed ? '#E6F6F5' : '#FDF6E7';
      const bannerText = isConfirmed ? '#103D45' : '#8A5A10';
      doc.roundedRect(48, 114, doc.page.width - 96, 44, 6).fill(bannerColor);
      doc
        .fillColor(bannerText)
        .fontSize(12)
        .text(
          `Reference: ${data.reference}    |    Status: ${BOOKING_STATUS_LABELS[data.status as keyof typeof BOOKING_STATUS_LABELS] ?? data.status}`,
          62,
          128,
        );

      doc.fillColor('#103D45').fontSize(16).text(data.snapshot.tourTitle, 48, 178);
      doc
        .fillColor('#475569')
        .fontSize(11)
        .text(
          `Date: ${data.snapshot.departureDate} at ${data.snapshot.startTime} (${data.snapshot.timezone})`,
          48,
          202,
        );
      if (data.snapshot.meetingPoint) {
        doc.text(`Meeting / Pickup Info: ${data.snapshot.meetingPoint}`, 48, 218);
      }

      doc.moveTo(48, 242).lineTo(doc.page.width - 48, 242).strokeColor('#D9D3C7').stroke();

      // Lead traveler details
      doc.fillColor('#103D45').fontSize(12).text('Traveler & Logistics', 48, 256);
      doc
        .fillColor('#334155')
        .fontSize(10.5)
        .text(`Lead Traveler: ${data.leadName}`, 48, 276)
        .text(`Email: ${data.leadEmail}  |  Phone: ${data.leadPhone}`, 48, 292)
        .text(`Seats Allocated: ${data.seatsAllocated}`, 48, 308);
      if (data.hotelName) {
        doc.text(`Hotel / Pickup Location: ${data.hotelName}`, 48, 324);
      }
      if (data.specialRequests) {
        doc.text(`Special Requests: ${data.specialRequests}`, 48, 340, { width: 320 });
      }

      // Check-in QR ONLY for confirmed bookings; strictly opaque token, ZERO raw PII inside QR
      if (isConfirmed && data.qrCheckinPayload) {
        const qrPng = await QRCode.toBuffer(data.qrCheckinPayload, { width: 120, margin: 1 });
        doc.image(qrPng, doc.page.width - 170, 252, { width: 115, height: 115 });
        doc
          .fillColor('#475569')
          .fontSize(8.5)
          .text('Staff Check-in QR (Opaque Token)', doc.page.width - 178, 370, { width: 130, align: 'center' });
      }

      // Itemized Financial Summary
      let y = 398;
      doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor('#D9D3C7').stroke();
      y += 14;
      doc.fillColor('#103D45').fontSize(12).text('Itemized Price & Payment Ledger', 48, y);
      y += 22;

      for (const item of data.snapshot.lineItems ?? []) {
        doc
          .fillColor('#334155')
          .fontSize(10)
          .text(`${item.label} (x${item.quantity})`, 48, y, { width: 340 })
          .text(formatMinorUnitsExact(item.totalMinor, data.currency), 400, y, { width: 145, align: 'right' });
        y += 18;
      }

      y += 8;
      doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor('#103D45').stroke();
      y += 12;

      const outstanding = Math.max(0, data.grandTotalMinor - data.collectedMinor);
      doc
        .fillColor('#103D45')
        .fontSize(11.5)
        .text('Grand Total', 48, y)
        .text(formatMinorUnitsExact(data.grandTotalMinor, data.currency), 400, y, { width: 145, align: 'right' });
      y += 18;
      doc
        .fillColor('#334155')
        .fontSize(10.5)
        .text(`Payment Status: ${PAYMENT_STATUS_LABELS[data.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] ?? data.paymentStatus}`, 48, y);
      y += 16;
      doc
        .text(`Amount Paid / Collected: ${formatMinorUnitsExact(data.collectedMinor, data.currency)}`, 48, y)
        .text(`Balance Outstanding: ${formatMinorUnitsExact(outstanding, data.currency)}`, 320, y, { width: 225, align: 'right' });

      y += 32;
      doc.fillColor('#103D45').fontSize(11).text('Accepted Cancellation & Booking Policy', 48, y);
      y += 16;
      doc
        .fillColor('#475569')
        .fontSize(9.5)
        .text(
          data.snapshot.policyTitle || 'Tour cancellation rules accepted at checkout apply in Africa/Cairo local time.',
          48,
          y,
          { width: doc.page.width - 96 },
        );

      if (!isConfirmed) {
        y += 36;
        doc
          .fillColor('#9A3412')
          .fontSize(9.5)
          .text(
            'IMPORTANT: This document is a request summary only. Present an official Confirmed Voucher at check-in once our team approves availability.',
            48,
            y,
            { width: doc.page.width - 96 },
          );
      }

      doc.end();
    });
  }
}
