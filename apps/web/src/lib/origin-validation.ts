'use client';

type OriginConstructor = {
  from(value: unknown): { isSameOrigin(other: unknown): boolean; opaque: boolean };
};

function extractOriginObject(candidate: unknown, OriginCtor: OriginConstructor) {
  try {
    return OriginCtor.from(candidate);
  } catch (err) {
    if (typeof MessageEvent !== 'undefined' && candidate instanceof MessageEvent) {
      return OriginCtor.from(candidate.origin);
    }
    throw err;
  }
}

/**
 * Verifies exact same-origin (scheme, host, port) for cross-window Live Editor postMessage calls.
 * Uses the Origin API when available, falling back to new URL() while strictly rejecting "null"
 * opaque origins (per modern-web-guidance validate-origins).
 */
export function isTrustedSameOriginEvent(event: MessageEvent, expectedOriginUrl: string): boolean {
  try {
    const g = globalThis as unknown as { Origin?: OriginConstructor };
    if (g.Origin) {
      const sender = extractOriginObject(event, g.Origin);
      const trusted = g.Origin.from(expectedOriginUrl);
      return !sender.opaque && sender.isSameOrigin(trusted);
    }
    if (!event.origin || event.origin === 'null') return false;
    const senderUrl = new URL(event.origin);
    const trustedUrl = new URL(expectedOriginUrl);
    return senderUrl.origin !== 'null' && senderUrl.origin === trustedUrl.origin;
  } catch {
    return false;
  }
}
