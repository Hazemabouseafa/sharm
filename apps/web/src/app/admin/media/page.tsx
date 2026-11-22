'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

interface MediaRow {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  folder: string;
  focalX: number;
  focalY: number;
  publicUrl: string;
  usageCount: number;
}

export default function AdminMediaPage() {
  const { adminFetch, hasPerm, toast } = useAdminAuth();
  const [items, setItems] = useState<MediaRow[]>([]);
  const [q, setQ] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [folder, setFolder] = useState('tours');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch<MediaRow[]>(`/admin/media${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setItems(res);
  }, [adminFetch, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('altText', altText);
      fd.append('folder', folder);
      await adminFetch('/admin/media/upload', { method: 'POST', formData: fd });
      toast('Image validated, EXIF-stripped, and optimized to WebP/JPEG.', 'success');
      setFile(null);
      setAltText('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload rejected', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {hasPerm('media:write') && (
        <form onSubmit={handleUpload} className="rounded-2xl border border-[#E5DFD2] bg-white p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[#103D45]">
            <Upload className="h-4 w-4 text-[#0E7C78]" aria-hidden="true" />
            Upload Public Media (JPEG, PNG, WebP — Magic-Byte Validated &amp; EXIF Stripped)
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <input type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs sm:col-span-2" />
            <input type="text" placeholder="Descriptive alt text" value={altText} onChange={(e) => setAltText(e.target.value)} className="min-h-[40px] rounded-xl border px-3 text-xs" />
            <div className="flex gap-2">
              <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="folder" className="min-h-[40px] w-24 rounded-xl border px-2 text-xs" />
              <button type="submit" disabled={uploading} className="min-h-[40px] flex-1 rounded-full bg-[#0E7C78] px-4 text-xs font-bold text-white disabled:opacity-50">
                {uploading ? 'Processing...' : 'Upload'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media filename or alt text..." className="min-h-[40px] w-72 rounded-xl border bg-white px-3 text-xs" />
        <button type="button" onClick={() => void load()} className="rounded-xl bg-[#103D45] px-4 text-xs font-bold text-white">Filter</button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DFD2] bg-white p-8 text-center text-sm text-[#52606D]">
          No uploaded media assets yet. Upload an image above to use across tours, destinations, and the Live Editor.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-xs">
              <img src={m.publicUrl} alt={m.altText || m.originalFilename} className="aspect-[16/10] w-full object-cover" />
              <div className="p-3.5 space-y-2 text-xs">
                <p className="truncate font-bold text-[#103D45]">{m.originalFilename}</p>
                <p className="text-[#52606D]">
                  {m.width}x{m.height} · {(m.sizeBytes / 1024).toFixed(0)} KB · {m.usageCount} refs
                </p>
                <input
                  type="text"
                  defaultValue={m.altText}
                  aria-label={`Alt text for ${m.originalFilename}`}
                  onBlur={async (e) => {
                    if (e.target.value !== m.altText && hasPerm('media:write')) {
                      await adminFetch(`/admin/media/${m.id}`, { method: 'PATCH', body: { altText: e.target.value } });
                      toast('Alt text saved.', 'success');
                    }
                  }}
                  placeholder="Edit alt text..."
                  className="min-h-[34px] w-full rounded-lg border px-2 text-xs"
                />
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.publicUrl);
                      toast('Media URL copied.', 'info');
                    }}
                    className="font-bold text-[#0E7C78] hover:underline"
                  >
                    Copy URL
                  </button>
                  {hasPerm('media:delete') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await adminFetch(`/admin/media/${m.id}`, { method: 'DELETE' });
                          toast('Media asset deleted.', 'success');
                          await load();
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Asset in use', 'error');
                        }
                      }}
                      aria-label={`Delete ${m.originalFilename}`}
                      className="text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
