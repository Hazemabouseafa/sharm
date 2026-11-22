import { z } from 'zod';

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  QUOTE_CHANGED: 'QUOTE_CHANGED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  POLICY_REQUIRED: 'POLICY_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  RESOURCE_IN_USE: 'RESOURCE_IN_USE',
  CUTOFF_PASSED: 'CUTOFF_PASSED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[number extends never ? never : keyof typeof ERROR_CODES];

export const QuoteRequestSchema = z.object({
  tourId: z.string().min(1),
  departureId: z.string().min(1),
  adults: z.number().int().min(1).max(100),
  children: z.number().int().min(0).max(100).default(0),
  infants: z.number().int().min(0).max(50).default(0),
  addons: z
    .array(
      z.object({
        addonId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .default([]),
  pickupZoneId: z.string().min(1).nullable().optional(),
  promoCode: z.string().trim().min(1).max(40).nullable().optional(),
  paymentChoice: z.enum(['PAY_LATER', 'BANK_TRANSFER', 'ONLINE_FULL', 'ONLINE_DEPOSIT']).default('PAY_LATER'),
});

export type QuoteRequestDto = z.infer<typeof QuoteRequestSchema>;

export const CreateBookingSchema = z.object({
  quoteId: z.string().min(1),
  expectedGrandTotalMinor: z.number().int().min(0),
  expectedCurrency: z.string().length(3),
  expectedPricingVersion: z.number().int().min(1),
  leadName: z.string().trim().min(2).max(120),
  leadEmail: z.string().trim().email().max(180),
  leadPhone: z.string().trim().min(6).max(40),
  nationality: z.string().trim().max(80).optional().nullable(),
  hotelName: z.string().trim().max(160).optional().nullable(),
  meetingNotes: z.string().trim().max(300).optional().nullable(),
  specialRequests: z.string().trim().max(1000).optional().nullable(),
  childAges: z.array(z.number().int().min(0).max(17)).max(30).optional(),
  acceptedPolicyVersionId: z.string().min(1),
  acceptedPolicyAtClient: z.boolean().refine((v) => v === true, {
    message: 'You must accept the booking and cancellation policy to continue',
  }),
  paymentChoice: z.enum(['PAY_LATER', 'BANK_TRANSFER', 'ONLINE_FULL', 'ONLINE_DEPOSIT']).default('PAY_LATER'),
});

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;

export const CreateInquirySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(40).optional().nullable(),
  destinationSlug: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().min(10).max(3000),
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: 'Please acknowledge the privacy policy before submitting',
  }),
  website: z.string().max(100).optional(), // honeypot field - must stay empty
});

export type CreateInquiryDto = z.infer<typeof CreateInquirySchema>;

export const TourFilterQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  duration: z.enum(['half-day', 'full-day', '2-days', '3-plus-days']).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['featured', 'price_asc', 'price_desc', 'duration_asc', 'duration_desc']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export type TourFilterQuery = z.infer<typeof TourFilterQuerySchema>;
