import { Injectable } from '@nestjs/common';

interface Bucket {
  timestamps: number[];
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= maxRequests) {
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterSec };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSec: 0 };
  }

  reset(prefix?: string): void {
    if (!prefix) {
      this.buckets.clear();
      return;
    }
    for (const k of this.buckets.keys()) {
      if (k.startsWith(prefix)) this.buckets.delete(k);
    }
  }
}
