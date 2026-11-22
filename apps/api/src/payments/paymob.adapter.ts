import { Injectable } from '@nestjs/common';
import { hmacSha512Hex, timingSafeEqualStr } from '../common/crypto';

export interface PaymobConfig {
  apiBaseUrl: string;
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrationId: string;
  currency: string;
  callbackUrl: string;
  enabled: boolean;
  sandboxVerified: boolean;
}

export interface CreateCheckoutIntentionInput {
  amountMinor: number;
  currency: string;
  merchantOrderId: string;
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  itemName: string;
  notificationUrl: string;
  redirectionUrl: string;
}

export interface CheckoutIntentionResult {
  externalIntentionId: string;
  checkoutUrl: string;
  rawStatus: string;
}

export interface PaymentProviderAdapter {
  readonly providerName: 'PAYMOB';
  getHealthStatus(cfg: PaymobConfig): {
    status: 'NOT_CONFIGURED' | 'CONFIGURED_UNVERIFIED' | 'READY';
    label: string;
    missingFields: string[];
  };
  createCheckoutIntention(cfg: PaymobConfig, input: CreateCheckoutIntentionInput): Promise<CheckoutIntentionResult>;
  verifyWebhookHmac(cfg: PaymobConfig, payload: Record<string, unknown>, receivedHmac: string): boolean;
}

/**
 * Paymob Unified Checkout Adapter (official Paymob Intention API v1 + HMAC-SHA512 webhook verification).
 * Never invents payment success when credentials are missing.
 */
@Injectable()
export class PaymobAdapter implements PaymentProviderAdapter {
  readonly providerName = 'PAYMOB' as const;

  getHealthStatus(cfg: PaymobConfig) {
    const missing: string[] = [];
    if (!cfg.secretKey) missing.push('PAYMOB_SECRET_KEY');
    if (!cfg.publicKey) missing.push('PAYMOB_PUBLIC_KEY');
    if (!cfg.hmacSecret) missing.push('PAYMOB_HMAC_SECRET');
    if (!cfg.integrationId) missing.push('PAYMOB_INTEGRATION_ID');
    if (!cfg.callbackUrl) missing.push('callbackUrl');

    if (missing.length > 0) {
      return {
        status: 'NOT_CONFIGURED' as const,
        label: 'Not configured',
        missingFields: missing,
      };
    }
    if (!cfg.sandboxVerified || !cfg.enabled) {
      return {
        status: 'CONFIGURED_UNVERIFIED' as const,
        label: cfg.enabled ? 'Configured — sandbox verification pending' : 'Configured — disabled',
        missingFields: [],
      };
    }
    return {
      status: 'READY' as const,
      label: 'Configured and verified',
      missingFields: [],
    };
  }

  async createCheckoutIntention(
    cfg: PaymobConfig,
    input: CreateCheckoutIntentionInput,
  ): Promise<CheckoutIntentionResult> {
    const health = this.getHealthStatus(cfg);
    if (health.status !== 'READY') {
      throw new Error(`Paymob adapter is not ready (${health.label})`);
    }

    const endpoint = `${cfg.apiBaseUrl.replace(/\/$/, '')}/v1/intention/`;
    const body = {
      amount: input.amountMinor,
      currency: input.currency,
      payment_methods: [Number(cfg.integrationId) || cfg.integrationId],
      items: [
        {
          name: input.itemName.slice(0, 60),
          amount: input.amountMinor,
          description: `Booking ${input.merchantOrderId}`,
          quantity: 1,
        },
      ],
      billing_data: {
        first_name: input.billing.firstName || 'Guest',
        last_name: input.billing.lastName || 'Traveler',
        email: input.billing.email,
        phone_number: input.billing.phone || '+201000000000',
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        city: 'Cairo',
        country: 'EG',
        state: 'NA',
      },
      special_reference: input.merchantOrderId,
      notification_url: input.notificationUrl,
      redirection_url: input.redirectionUrl,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${cfg.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Paymob intention API returned ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as { id?: string; client_secret?: string; status?: string };
    if (!data.client_secret) {
      throw new Error('Paymob response did not contain client_secret');
    }

    const checkoutUrl = `${cfg.apiBaseUrl.replace(/\/$/, '')}/unifiedcheckout/?publicKey=${encodeURIComponent(cfg.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`;
    return {
      externalIntentionId: data.id ?? input.merchantOrderId,
      checkoutUrl,
      rawStatus: data.status ?? 'intended',
    };
  }

  /**
   * Computes canonical Paymob HMAC-SHA512 string across the 20 standard transaction callback fields.
   */
  computeCanonicalTransactionHmac(hmacSecret: string, obj: Record<string, unknown>): string {
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

    return hmacSha512Hex(hmacSecret, concatenated);
  }

  verifyWebhookHmac(cfg: PaymobConfig, payload: Record<string, unknown>, receivedHmac: string): boolean {
    if (!cfg.hmacSecret || !receivedHmac) return false;
    const obj = (payload.obj ?? payload) as Record<string, unknown>;
    const computed = this.computeCanonicalTransactionHmac(cfg.hmacSecret, obj);
    return timingSafeEqualStr(computed.toLowerCase(), receivedHmac.trim().toLowerCase());
  }
}
