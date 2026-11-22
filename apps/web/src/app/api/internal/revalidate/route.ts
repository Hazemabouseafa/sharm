import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import crypto from 'crypto';

function timingSafeMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Internal cache invalidation endpoint called by NestJS API & Worker immediately upon
 * CMS Publish / Rollback / Tour Publish so public visitors see updated content without rebuild/restart.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATION_SECRET || '';
  const provided = req.headers.get('x-revalidation-secret') || '';
  if (!secret || !provided || !timingSafeMatch(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { tags?: string[]; paths?: string[] } = {};
  try {
    body = (await req.json()) as { tags?: string[]; paths?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [];
  const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string' && p.startsWith('/')) : [];

  for (const tag of tags) {
    revalidateTag(tag);
  }
  for (const p of paths) {
    revalidatePath(p);
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    paths,
    timestamp: new Date().toISOString(),
  });
}
