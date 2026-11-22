'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Save, AlertCircle } from 'lucide-react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

export default function AdminSettingsPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [txStats, setTxStats] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<Record<string, unknown>>('/admin/settings')
      .then(setSettings)
      .catch((err) => toast(err instanceof Error ? err.message : 'Unable to load settings', 'error'));

    adminFetch<{ counts: Record<string, number> }>('/admin/translations/stats')
      .then((res) => setTxStats(res.counts))
      .catch(() => {});
  }, [adminFetch, toast]);

  if (!settings) return <p className="text-sm text-[#52606D]">Loading operational settings...</p>;

  const bankDetails = ((settings.bankDetailsJson ?? {}) as Record<string, string>) || {};
  function updateBank(field: string, value: string) {
    setSettings({
      ...settings,
      bankDetailsJson: { ...bankDetails, [field]: value },
    });
  }

  const hasContactEmail = Boolean(String(settings.contactEmail || '').trim()) && !String(settings.contactEmail || '').includes('.example');
  const hasContactPhone = Boolean(String(settings.contactPhone || '').trim() || String(settings.whatsappNumber || '').trim());
  const hasBankAccount = Boolean(bankDetails.bankName?.trim() && bankDetails.iban?.trim());

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await adminFetch<Record<string, unknown>>('/admin/settings', {
        method: 'PATCH',
        body: settings,
      });
      setSettings(updated);
      toast('Settings saved and audited.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-4xl space-y-6">
      {/* Go-Live Readiness & Automatic Translation Overview */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Go-Live Readiness &amp; Automatic Translation</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className={`rounded-xl border p-3 ${settings.payLaterEnabled ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
            <div className="flex items-center gap-1.5 font-bold text-[#103D45]">
              {settings.payLaterEnabled ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
              Pay Later Bookings
            </div>
            <p className="mt-1 text-[#52606D]">{settings.payLaterEnabled ? 'Active & accepting guests' : 'Disabled'}</p>
          </div>
          <div className={`rounded-xl border p-3 ${hasContactEmail ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
            <div className="flex items-center gap-1.5 font-bold text-[#103D45]">
              {hasContactEmail ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
              Reservations Email
            </div>
            <p className="mt-1 text-[#52606D]">{hasContactEmail ? String(settings.contactEmail) : 'Enter your real business email below'}</p>
          </div>
          <div className={`rounded-xl border p-3 ${hasContactPhone ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
            <div className="flex items-center gap-1.5 font-bold text-[#103D45]">
              {hasContactPhone ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
              Phone / WhatsApp
            </div>
            <p className="mt-1 text-[#52606D]">{hasContactPhone ? 'Configured' : 'Optional — add below to display'}</p>
          </div>
          <div className={`rounded-xl border p-3 ${hasBankAccount ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
            <div className="flex items-center gap-1.5 font-bold text-[#103D45]">
              {hasBankAccount ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
              Bank Transfer Details
            </div>
            <p className="mt-1 text-[#52606D]">{hasBankAccount ? 'IBAN configured' : 'Add real IBAN below if accepting transfers'}</p>
          </div>
        </div>

        {txStats && (
          <div className="rounded-xl border border-[#D8D1C2] bg-[#FAF8F4] p-4">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#103D45]">
              <Globe className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
              <span>Automatic Translation Cache (PostgreSQL)</span>
            </div>
            <p className="mt-1 text-xs text-[#52606D]">
              All newly created or edited tours, destinations, and CMS pages are translated automatically in the background and stored permanently.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold" data-no-admin-translate="true">
              {(['ru', 'it', 'tr', 'pl', 'ar'] as const).map((code) => (
                <span key={code} className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1 text-[#103D45]">
                  {code.toUpperCase()}: {txStats[code] ?? 0}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Company Identity &amp; Genuine Public Contacts</h2>
        <p className="text-xs text-[#52606D]">
          Leave WhatsApp or address blank until verified business details are ready — blank channels stay hidden automatically on public pages.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-cname" className="block text-xs font-bold">Company Name</label>
            <input id="s-cname" value={String(settings.companyName || '')} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-legal" className="block text-xs font-bold">Registered Legal Name</label>
            <input id="s-legal" value={String(settings.legalName || '')} onChange={(e) => setSettings({ ...settings, legalName: e.target.value })} className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-email" className="block text-xs font-bold">Public Reservations Email</label>
            <input id="s-email" type="email" value={String(settings.contactEmail || '')} onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })} placeholder="reservations@sharmpharaoh.com" className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-phone" className="block text-xs font-bold">Public Contact Phone</label>
            <input id="s-phone" value={String(settings.contactPhone || '')} onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })} placeholder="+20 10 ..." className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-wa" className="block text-xs font-bold">WhatsApp Number (E.164, e.g. +2010...)</label>
            <input id="s-wa" value={String(settings.whatsappNumber || '')} onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })} placeholder="Leave empty to hide WhatsApp button" className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-addr" className="block text-xs font-bold">Verified Office Address (Optional)</label>
            <input id="s-addr" value={String(settings.addressText || '')} onChange={(e) => setSettings({ ...settings, addressText: e.target.value })} placeholder="Sharm El Sheikh, South Sinai, Egypt" className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-4">
        <h2 className="text-base font-extrabold text-[#103D45]">Booking Hold Windows, Payment Modes &amp; Bank Details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="s-curr" className="block text-xs font-bold">Base Currency</label>
            <select id="s-curr" value={String(settings.baseCurrency || 'USD')} onChange={(e) => setSettings({ ...settings, baseCurrency: e.target.value })} className="mt-1 min-h-[42px] w-full rounded-xl border bg-white px-3 text-sm">
              {['USD', 'EUR', 'GBP', 'EGP'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="s-mhold" className="block text-xs font-bold">Manual Request Hold (Hours)</label>
            <input id="s-mhold" type="number" min={1} max={168} value={Number(settings.manualRequestHoldHours || 24)} onChange={(e) => setSettings({ ...settings, manualRequestHoldHours: Number(e.target.value) })} className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="s-ohold" className="block text-xs font-bold">Online Checkout Hold (Minutes)</label>
            <input id="s-ohold" type="number" min={5} max={60} value={Number(settings.onlineCheckoutHoldMinutes || 15)} onChange={(e) => setSettings({ ...settings, onlineCheckoutHoldMinutes: Number(e.target.value) })} className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2 text-xs font-bold">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.payLaterEnabled)} onChange={(e) => setSettings({ ...settings, payLaterEnabled: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
            Enable Pay Later Requests
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.bankTransferEnabled)} onChange={(e) => setSettings({ ...settings, bankTransferEnabled: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
            Enable Manual Bank Transfer
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(settings.maintenanceBannerEnabled)} onChange={(e) => setSettings({ ...settings, maintenanceBannerEnabled: e.target.checked })} className="h-4 w-4 accent-[#0E7C78]" />
            Show Maintenance Banner
          </label>
        </div>

        {Boolean(settings.bankTransferEnabled) && (
          <div className="grid gap-4 rounded-xl border border-[#E5DFD2] bg-[#FAF8F4] p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="s-bname" className="block text-xs font-bold">Bank Name</label>
              <input id="s-bname" value={bankDetails.bankName || ''} onChange={(e) => updateBank('bankName', e.target.value)} placeholder="e.g. CIB Egypt / QNB Alahli" className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="s-bacc" className="block text-xs font-bold">Account Holder Name</label>
              <input id="s-bacc" value={bankDetails.accountName || ''} onChange={(e) => updateBank('accountName', e.target.value)} placeholder="Sharm Pharaoh Travel LLC" className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="s-biban" className="block text-xs font-bold">IBAN / Account Number</label>
              <input id="s-biban" value={bankDetails.iban || ''} onChange={(e) => updateBank('iban', e.target.value)} placeholder="EG..." className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 font-mono text-sm" />
            </div>
            <div>
              <label htmlFor="s-bswift" className="block text-xs font-bold">SWIFT / BIC Code</label>
              <input id="s-bswift" value={bankDetails.swiftCode || ''} onChange={(e) => updateBank('swiftCode', e.target.value)} placeholder="CIBEEGCX..." className="mt-1 min-h-[40px] w-full rounded-xl border bg-white px-3 font-mono text-sm" />
            </div>
          </div>
        )}

        {Boolean(settings.maintenanceBannerEnabled) && (
          <div>
            <label htmlFor="s-mbanner" className="block text-xs font-bold">Maintenance Banner Message</label>
            <input id="s-mbanner" value={String(settings.maintenanceBannerText || '')} onChange={(e) => setSettings({ ...settings, maintenanceBannerText: e.target.value })} className="mt-1 min-h-[42px] w-full rounded-xl border px-3 text-sm" />
          </div>
        )}
      </section>

      {hasPerm('settings:write') && (
        <button type="submit" disabled={saving} className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0E7C78] px-7 text-sm font-bold text-white hover:bg-[#103D45] disabled:opacity-50">
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      )}
    </form>
  );
}
