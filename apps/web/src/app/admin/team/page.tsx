'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { STAFF_ROLES } from '@sharm/contracts';
import { StatusBadge } from '@sharm/ui';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface TeamMember {
  id: string;
  email: string;
  username?: string | null;
  fullName: string;
  role: string;
  isActive: boolean;
  suspendedAt: string | null;
  totpEnabledAt: string | null;
  _count: { sessions: number };
}

export default function AdminTeamPage() {
  const { user, adminFetch, hasPerm, toast, refreshMe } = useAdminAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('RESERVATIONS_AGENT');
  const [password, setPassword] = useState('');

  // Personal 2FA setup
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!hasPerm('team:read')) return;
    setMembers(await adminFetch<TeamMember[]>('/admin/team'));
  }, [adminFetch, hasPerm]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminFetch('/admin/team', {
        method: 'POST',
        body: { email, fullName, role, password },
      });
      setEmail('');
      setFullName('');
      setPassword('');
      toast('Staff account created.', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to create staff account', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Personal 2FA Controls */}
      <section className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
              <ShieldCheck className="h-5 w-5 text-[#0E7C78]" aria-hidden="true" />
              Your Two-Factor Authentication (TOTP 2FA)
            </h2>
            <p className="text-xs text-[#52606D]">Recommended for all Owner, Manager, and Finance staff accounts.</p>
          </div>
          <StatusBadge status={user?.totpEnabled ? 'PUBLISHED' : 'DRAFT'} label={user?.totpEnabled ? '2FA Enabled' : '2FA Not Enabled'} />
        </div>

        {!user?.totpEnabled && !qrDataUrl && (
          <button
            type="button"
            onClick={async () => {
              const res = await adminFetch<{ qrDataUrl: string; manualSecret: string }>('/admin/auth/2fa/setup', { method: 'POST' });
              setQrDataUrl(res.qrDataUrl);
              setManualSecret(res.manualSecret);
            }}
            className="min-h-[42px] rounded-full bg-[#103D45] px-5 text-xs font-bold text-white"
          >
            Set Up Authenticator App (TOTP)
          </button>
        )}

        {qrDataUrl && (
          <div className="flex flex-wrap items-center gap-6 rounded-xl bg-[#FAF8F4] p-4">
            <img src={qrDataUrl} alt="Authenticator QR code" className="h-36 w-36 rounded-lg border bg-white p-1" />
            <div className="space-y-3 text-xs">
              <p>Scan with Google Authenticator / 1Password / Authy, or enter secret: <code className="font-mono font-bold">{manualSecret}</code></p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="min-h-[40px] w-36 rounded-xl border bg-white px-3 font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await adminFetch<{ recoveryCodes: string[] }>('/admin/auth/2fa/enable', {
                        method: 'POST',
                        body: { totpCode },
                      });
                      setRecoveryCodes(res.recoveryCodes);
                      setQrDataUrl('');
                      toast('2FA enabled! Store your single-use recovery codes securely.', 'success');
                      await refreshMe();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Invalid code', 'error');
                    }
                  }}
                  className="rounded-full bg-[#0E7C78] px-4 font-bold text-white"
                >
                  Verify &amp; Enable
                </button>
              </div>
            </div>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
            <p className="font-bold">Save these single-use recovery codes now (shown once):</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono sm:grid-cols-4">
              {recoveryCodes.map((c) => <span key={c} className="rounded bg-white px-2 py-1 text-center">{c}</span>)}
            </div>
          </div>
        )}
      </section>

      {/* Invite / Create Staff Member (OWNER only) */}
      {hasPerm('team:manage') && (
        <form onSubmit={handleCreateStaff} className="rounded-2xl border border-[#E5DFD2] bg-white p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
            <UserPlus className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
            Create Staff Account
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <input required placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="min-h-[40px] rounded-xl border px-3 text-xs" />
            <input required type="email" placeholder="Staff email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[40px] rounded-xl border px-3 text-xs" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="min-h-[40px] rounded-xl border bg-white px-3 text-xs">
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            <div className="flex gap-2">
              <input required type="password" minLength={12} placeholder="Min 12-char password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[40px] flex-1 rounded-xl border px-3 text-xs" />
              <button type="submit" className="rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white">Add</button>
            </div>
          </div>
        </form>
      )}

      {/* Team Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <caption className="visually-hidden">Staff team members</caption>
          <thead className="border-b border-[#E5DFD2] bg-[#FAF8F4] text-xs uppercase text-[#52606D]">
            <tr>
              <th scope="col" className="p-3.5">Staff Member</th>
              <th scope="col" className="p-3.5">Role</th>
              <th scope="col" className="p-3.5">Status / 2FA</th>
              <th scope="col" className="p-3.5">Active Sessions</th>
              <th scope="col" className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1EDE4]">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="p-3.5">
                  <p className="font-bold text-[#103D45]">{m.fullName}</p>
                  <p className="text-xs text-[#52606D]">
                    {m.username ? <span className="font-mono font-semibold text-[#0E7C78]">@{m.username} · </span> : null}
                    {m.email}
                  </p>
                </td>
                <td className="p-3.5">
                  {hasPerm('team:manage') ? (
                    <select
                      aria-label={`Role for ${m.fullName}`}
                      value={m.role}
                      onChange={async (e) => {
                        try {
                          await adminFetch(`/admin/team/${m.id}`, { method: 'PATCH', body: { role: e.target.value } });
                          toast('Role updated and user sessions revoked for security.', 'success');
                          await load();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Role update blocked', 'error');
                        }
                      }}
                      className="rounded-lg border px-2 py-1 text-xs font-bold"
                    >
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs font-bold">{m.role}</span>
                  )}
                </td>
                <td className="p-3.5">
                  <div className="flex gap-1.5">
                    <StatusBadge status={m.suspendedAt ? 'CANCELLED' : 'PUBLISHED'} label={m.suspendedAt ? 'Suspended' : 'Active'} />
                    {m.totpEnabledAt && <StatusBadge status="CONFIRMED" label="2FA" />}
                  </div>
                </td>
                <td className="p-3.5 text-xs">{m._count.sessions}</td>
                <td className="p-3.5 text-right">
                  {hasPerm('team:manage') && (
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminFetch(`/admin/team/${m.id}/revoke-sessions`, { method: 'POST' });
                          toast('All sessions revoked.', 'info');
                          await load();
                        }}
                        className="rounded-lg border px-2.5 py-1 text-xs font-bold"
                      >
                        Revoke Sessions
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await adminFetch(`/admin/team/${m.id}`, { method: 'PATCH', body: { suspend: !m.suspendedAt } });
                            toast(m.suspendedAt ? 'Account reactivated.' : 'Account suspended & sessions revoked.', 'success');
                            await load();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Action blocked', 'error');
                          }
                        }}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800"
                      >
                        {m.suspendedAt ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
