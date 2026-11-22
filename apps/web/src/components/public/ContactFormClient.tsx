'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Mail, MessageCircle, Phone, Send } from 'lucide-react';
import { clientApi } from '@/lib/api';
import type { PublicSiteContext } from './SiteHeader';

export function ContactFormClient({
  heading,
  subheading,
  sideHeading,
  sideBody,
  destinations,
  site,
}: {
  heading: string;
  subheading: string;
  sideHeading: string;
  sideBody: string;
  destinations: Array<{ slug: string; name: string }>;
  site: PublicSiteContext;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [destinationSlug, setDestinationSlug] = useState('');
  const [message, setMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const cleanPhone = site.demoMode ? site.contactPhone : (site.contactPhone || '').replace(/\s*\(demo\)\s*/gi, '').trim();
  const whatsappDigits = (site.whatsappNumber || '').replace(/\D/g, '');
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent('Hello Sharm Pharaoh Travel, I would like to plan a trip to Egypt.')}`
    : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!privacyAccepted) {
      setError('Please acknowledge our privacy policy before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await clientApi<{ id: string; message: string }>('/public/inquiries', {
        method: 'POST',
        body: {
          fullName,
          email,
          phone: phone || undefined,
          destinationSlug: destinationSlug || undefined,
          message,
          privacyAccepted,
          website: honeypot,
        },
      });
      setSubmittedId(res.id);
      setFullName('');
      setEmail('');
      setPhone('');
      setDestinationSlug('');
      setMessage('');
      setPrivacyAccepted(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your message right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-7 rounded-2xl border border-[#E5DFD2] bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <h2 id="contact-form-heading" className="text-2xl font-extrabold text-[#103D45]">
            {heading}
          </h2>
          <p className="mt-1.5 text-sm text-[#52606D]">{subheading}</p>
        </div>

        <div aria-live="polite" className="mt-5">
          {submittedId && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <p className="font-bold">Inquiry saved — our travel team has received your message.</p>
                  <p className="mt-1 text-emerald-900">
                    Reference ID: <code className="font-mono font-semibold">{submittedId}</code>. We will reply by email as soon as our advisors review your plans.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} aria-labelledby="contact-form-heading" className="mt-6 space-y-5">
          {/* Honeypot anti-spam field hidden from assistive tech & keyboard */}
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="contact-website">Leave this blank</label>
            <input
              id="contact-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="contact-name" className="block text-sm font-bold text-[#103D45]">
              Full Name <span className="text-rose-700" aria-hidden="true">*</span>
            </label>
            <input
              id="contact-name"
              name="fullName"
              type="text"
              required
              minLength={2}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-[#103D45]"
            />
          </div>

          <div>
            <label htmlFor="contact-email" className="block text-sm font-bold text-[#103D45]">
              Email Address <span className="text-rose-700" aria-hidden="true">*</span>
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-[#103D45]"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-phone" className="block text-sm font-bold text-[#103D45]">
                Phone Number <span className="font-normal text-[#52606D]">(Optional)</span>
              </label>
              <input
                id="contact-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 100 000 0000"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-[#103D45]"
              />
            </div>

            <div>
              <label htmlFor="contact-destination" className="block text-sm font-bold text-[#103D45]">
                Destination of Interest
              </label>
              <select
                id="contact-destination"
                name="destinationSlug"
                value={destinationSlug}
                onChange={(e) => setDestinationSlug(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-[#103D45]"
              >
                <option value="">Select a destination</option>
                {destinations.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="contact-message" className="block text-sm font-bold text-[#103D45]">
              Your Message <span className="text-rose-700" aria-hidden="true">*</span>
            </label>
            <textarea
              id="contact-message"
              name="message"
              required
              minLength={10}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your preferred dates, group size, destinations, or custom itinerary requests."
              className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-[#103D45]"
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              id="contact-privacy"
              name="privacyAccepted"
              type="checkbox"
              required
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-[#94A3B8] accent-[#0E7C78]"
            />
            <label htmlFor="contact-privacy" className="text-sm text-[#334155]">
              I acknowledge the{' '}
              <Link href="/p/privacy" className="font-semibold text-[#0E7C78] underline">
                Privacy Policy
              </Link>{' '}
              and consent to Sharm Pharaoh Travel responding to my inquiry.
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[#0E7C78] px-6 font-bold text-white shadow-sm transition hover:bg-[#103D45] disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {submitting ? 'Sending Message...' : 'Send Message'}
          </button>
        </form>
      </div>

      <aside className="lg:col-span-5 flex flex-col justify-between overflow-hidden rounded-2xl bg-[#103D45] p-7 text-white shadow-md">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight">{sideHeading}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/85">{sideBody}</p>
          <div className="my-6 h-1 w-16 rounded-full bg-[#C9A66B]" aria-hidden="true" />

          <div className="space-y-3">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-full bg-[#18A5A0] px-5 font-bold text-[#0A292F] transition hover:bg-[#E3C68E]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                Chat on WhatsApp
              </a>
            )}
            {site.contactEmail && (
              <a
                href={`mailto:${site.contactEmail}`}
                className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-full border border-white/35 px-5 font-semibold text-white transition hover:bg-white/10"
              >
                <Mail className="h-5 w-5 text-[#E3C68E]" aria-hidden="true" />
                Email Us ({site.contactEmail})
              </a>
            )}
            {cleanPhone && (
              <a
                href={`tel:${cleanPhone.replace(/[^\d+]/g, '')}`}
                className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-full border border-white/25 px-5 font-semibold tabular-nums text-white/95 transition hover:bg-white/10"
              >
                <Phone className="h-5 w-5 text-[#E3C68E]" aria-hidden="true" />
                {cleanPhone}
              </a>
            )}
            {!whatsappHref && !site.contactEmail && !cleanPhone && (
              <p className="rounded-xl border border-white/15 bg-white/5 p-4 text-xs text-white/80">
                Direct phone and WhatsApp contact channels will appear here once configured by the business owner in Admin Settings. You can always reach our team using the inquiry form.
              </p>
            )}
          </div>
        </div>

        {site.addressText && (
          <div className="mt-8 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/85">
            <p className="text-xs font-bold uppercase tracking-wider text-[#E3C68E]">Office Address</p>
            <p className="mt-1">{site.addressText}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
