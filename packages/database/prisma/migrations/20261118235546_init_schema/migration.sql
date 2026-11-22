-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'RESERVATIONS_AGENT', 'CONTENT_EDITOR', 'FINANCE', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('PER_PERSON', 'PRIVATE_GROUP');

-- CreateEnum
CREATE TYPE "AddonPricingBasis" AS ENUM ('PER_PERSON', 'PER_BOOKING');

-- CreateEnum
CREATE TYPE "DepartureStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentChoice" AS ENUM ('PAY_LATER', 'BANK_TRANSFER', 'ONLINE_FULL', 'ONLINE_DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAY_LATER', 'BANK_TRANSFER', 'PAYMOB');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CAPTURE', 'MANUAL_PAYMENT', 'REFUND', 'OVERPAYMENT_EXCEPTION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('RESERVED', 'FINALIZED', 'RELEASED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'REPLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CmsPageKind" AS ENUM ('HOME', 'TOURS', 'DESTINATION', 'CONTACT', 'LEGAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CmsRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublishScheduleStatus" AS ENUM ('PENDING', 'PUBLISHED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxJobStatus" AS ENUM ('PENDING', 'LEASED', 'COMPLETED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "suspendedAt" TIMESTAMP(3),
    "totpSecretEncrypted" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReauthAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT NOT NULL DEFAULT '',
    "folder" TEXT NOT NULL DEFAULT 'general',
    "tagsJson" JSONB NOT NULL DEFAULT '[]',
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "cropJson" JSONB,
    "variantsJson" JSONB NOT NULL DEFAULT '{}',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "heroMediaId" TEXT,
    "heroImageUrl" TEXT NOT NULL,
    "heroImageAlt" TEXT NOT NULL,
    "highlightsJson" JSONB NOT NULL DEFAULT '[]',
    "faqJson" JSONB NOT NULL DEFAULT '[]',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'compass',
    "description" TEXT NOT NULL DEFAULT '',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "freeCancellationHours" INTEGER NOT NULL DEFAULT 24,
    "partialRefundHours" INTEGER NOT NULL DEFAULT 12,
    "partialRefundPercentBps" INTEGER NOT NULL DEFAULT 5000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "freeCancellationHours" INTEGER NOT NULL,
    "partialRefundHours" INTEGER NOT NULL,
    "partialRefundPercentBps" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pricingBasis" "AddonPricingBasis" NOT NULL DEFAULT 'PER_BOOKING',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "eligibleBandsJson" JSONB NOT NULL DEFAULT '["ADULT","CHILD"]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupZone" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surchargeMinor" INTEGER NOT NULL DEFAULT 0,
    "pricingBasis" "AddonPricingBasis" NOT NULL DEFAULT 'PER_BOOKING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "requiresHotelDetails" BOOLEAN NOT NULL DEFAULT true,
    "defaultPickupOffsetMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TourStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "highlightsJson" JSONB NOT NULL DEFAULT '[]',
    "durationLabel" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL DEFAULT 8,
    "guideLanguagesJson" JSONB NOT NULL DEFAULT '["English"]',
    "meetingPoint" TEXT NOT NULL DEFAULT '',
    "minAge" INTEGER NOT NULL DEFAULT 0,
    "accessibilityInfo" TEXT NOT NULL DEFAULT '',
    "itineraryJson" JSONB NOT NULL DEFAULT '[]',
    "inclusionsJson" JSONB NOT NULL DEFAULT '[]',
    "exclusionsJson" JSONB NOT NULL DEFAULT '[]',
    "whatToBringJson" JSONB NOT NULL DEFAULT '[]',
    "faqJson" JSONB NOT NULL DEFAULT '[]',
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'PER_PERSON',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pricingVersion" INTEGER NOT NULL DEFAULT 1,
    "privateGroupPriceMinor" INTEGER,
    "minAdults" INTEGER NOT NULL DEFAULT 1,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySize" INTEGER NOT NULL DEFAULT 16,
    "ageBandsJson" JSONB NOT NULL DEFAULT '[]',
    "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "serviceFeeIncluded" BOOLEAN NOT NULL DEFAULT true,
    "serviceFeeBps" INTEGER NOT NULL DEFAULT 0,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositPercentBps" INTEGER NOT NULL DEFAULT 0,
    "instantConfirmPayLater" BOOLEAN NOT NULL DEFAULT false,
    "defaultCapacity" INTEGER NOT NULL DEFAULT 16,
    "defaultCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "policyId" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "primaryMediaId" TEXT,
    "primaryImageUrl" TEXT NOT NULL,
    "primaryImageAlt" TEXT NOT NULL,
    "galleryJson" JSONB NOT NULL DEFAULT '[]',
    "relatedTourIdsJson" JSONB NOT NULL DEFAULT '[]',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourCategory" (
    "tourId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "TourCategory_pkey" PRIMARY KEY ("tourId","categoryId")
);

-- CreateTable
CREATE TABLE "TourAddon" (
    "tourId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,

    CONSTRAINT "TourAddon_pkey" PRIMARY KEY ("tourId","addonId")
);

-- CreateTable
CREATE TABLE "TourPickupZone" (
    "tourId" TEXT NOT NULL,
    "pickupZoneId" TEXT NOT NULL,

    CONSTRAINT "TourPickupZone_pkey" PRIMARY KEY ("tourId","pickupZoneId")
);

-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "weekdaysJson" JSONB NOT NULL,
    "startTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cutoffHours" INTEGER NOT NULL DEFAULT 12,
    "adultPriceOverrideMinor" INTEGER,
    "childPriceOverrideMinor" INTEGER,
    "privateGroupPriceOverrideMinor" INTEGER,
    "activeFromDate" TEXT NOT NULL,
    "activeToDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackoutDate" (
    "id" TEXT NOT NULL,
    "tourId" TEXT,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Departure" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "departureDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "startUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "capacity" INTEGER NOT NULL,
    "bookedSeats" INTEGER NOT NULL DEFAULT 0,
    "heldSeats" INTEGER NOT NULL DEFAULT 0,
    "status" "DepartureStatus" NOT NULL DEFAULT 'OPEN',
    "cutoffHours" INTEGER NOT NULL DEFAULT 12,
    "adultPriceOverrideMinor" INTEGER,
    "childPriceOverrideMinor" INTEGER,
    "infantPriceOverrideMinor" INTEGER,
    "privateGroupPriceOverrideMinor" INTEGER,
    "pickupTimeNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Departure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minOrderMinor" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxTotalUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerEmail" INTEGER,
    "eligibleTourIdsJson" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingQuote" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "pricingVersion" INTEGER NOT NULL,
    "pricingMode" "PricingMode" NOT NULL,
    "seatsRequired" INTEGER NOT NULL,
    "travelersJson" JSONB NOT NULL,
    "selectedAddonsJson" JSONB NOT NULL,
    "pickupZoneId" TEXT,
    "promotionId" TEXT,
    "paymentChoice" "PaymentChoice" NOT NULL,
    "baseSubtotalMinor" INTEGER NOT NULL,
    "addonsSubtotalMinor" INTEGER NOT NULL,
    "pickupSubtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "serviceFeeMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "grandTotalMinor" INTEGER NOT NULL,
    "dueNowMinor" INTEGER NOT NULL,
    "dueLaterMinor" INTEGER NOT NULL,
    "lineItemsJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "tourId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "seatsAllocated" INTEGER NOT NULL,
    "allocationActive" BOOLEAN NOT NULL DEFAULT true,
    "holdExpiresAt" TIMESTAMP(3),
    "decisionDeadlineAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "pricingVersion" INTEGER NOT NULL,
    "baseSubtotalMinor" INTEGER NOT NULL,
    "addonsSubtotalMinor" INTEGER NOT NULL,
    "pickupSubtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "serviceFeeMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "grandTotalMinor" INTEGER NOT NULL,
    "dueNowMinor" INTEGER NOT NULL,
    "dueLaterMinor" INTEGER NOT NULL,
    "paymentChoice" "PaymentChoice" NOT NULL,
    "leadName" TEXT NOT NULL,
    "leadEmail" TEXT NOT NULL,
    "leadPhone" TEXT NOT NULL,
    "nationality" TEXT,
    "hotelName" TEXT,
    "meetingNotes" TEXT,
    "specialRequests" TEXT,
    "travelersJson" JSONB NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "acceptedPolicyAt" TIMESTAMP(3) NOT NULL,
    "promotionId" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "qrCheckinTokenHash" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "paidUnfulfilledFlag" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingNote" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseJson" JSONB NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAccessToken" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalOrderId" TEXT,
    "externalIntentionId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "submittedAmountMinor" INTEGER NOT NULL,
    "submittedCurrency" TEXT NOT NULL,
    "transferReference" TEXT NOT NULL,
    "note" TEXT,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLedgerEntry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "attemptId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "externalRef" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByType" TEXT NOT NULL,
    "requestedById" TEXT,
    "processedById" TEXT,
    "externalRefundRef" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "destinationSlug" TEXT,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "assignedStaffId" TEXT,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "sourceIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CmsPageKind" NOT NULL,
    "title" TEXT NOT NULL,
    "destinationId" TEXT,
    "publishedRevisionId" TEXT,
    "currentDraftId" TEXT,
    "isSystemProtected" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "CmsRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "contentJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsPublishSchedule" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "scheduledForUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "status" "PublishScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "executedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsPublishSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsGlobalContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "draftJson" JSONB NOT NULL,
    "publishedJson" JSONB NOT NULL,
    "publishedRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsGlobalContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlugRedirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Sharm Pharaoh Travel',
    "legalName" TEXT NOT NULL DEFAULT '',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "whatsappNumber" TEXT NOT NULL DEFAULT '',
    "addressText" TEXT NOT NULL DEFAULT '',
    "mapEmbedUrl" TEXT NOT NULL DEFAULT '',
    "socialsJson" JSONB NOT NULL DEFAULT '{}',
    "payLaterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bankTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankDetailsJson" JSONB NOT NULL DEFAULT '{}',
    "manualRequestHoldHours" INTEGER NOT NULL DEFAULT 24,
    "onlineCheckoutHoldMinutes" INTEGER NOT NULL DEFAULT 15,
    "defaultTaxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "defaultTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "maintenanceBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceBannerText" TEXT NOT NULL DEFAULT '',
    "retentionConfigJson" JSONB NOT NULL DEFAULT '{"inquiriesDays":365,"guestTokensDays":30,"travelerPiiDays":730,"financialRecordsYears":7,"auditLogYears":5}',
    "emailTemplatesJson" JSONB NOT NULL DEFAULT '{}',
    "seoDefaultsJson" JSONB NOT NULL DEFAULT '{}',
    "encryptedPaymobSecretsJson" TEXT,
    "paymobNonSecretConfigJson" JSONB NOT NULL DEFAULT '{"enabled":false,"sandboxVerified":false,"currency":"USD","integrationId":"","callbackUrl":""}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "requestId" TEXT,
    "reason" TEXT,
    "beforeRedactedJson" JSONB,
    "afterRedactedJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payloadJson" JSONB NOT NULL,
    "status" "OutboxJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfterUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntilUtc" TIMESTAMP(3),
    "leasedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "toEmail" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "bookingId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_userId_revokedAt_idx" ON "StaffSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "StaffSession_absoluteExpiresAt_idx" ON "StaffSession"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "StaffRecoveryCode_userId_usedAt_idx" ON "StaffRecoveryCode"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_visibility_folder_idx" ON "MediaAsset"("visibility", "folder");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_isVisible_displayOrder_idx" ON "Destination"("isVisible", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_code_key" ON "PolicyDocument"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policyId_versionNumber_key" ON "PolicyVersion"("policyId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Addon_code_key" ON "Addon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PickupZone_destinationId_name_key" ON "PickupZone"("destinationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tour_slug_key" ON "Tour"("slug");

-- CreateIndex
CREATE INDEX "Tour_status_featured_displayOrder_idx" ON "Tour"("status", "featured", "displayOrder");

-- CreateIndex
CREATE INDEX "Tour_destinationId_status_idx" ON "Tour"("destinationId", "status");

-- CreateIndex
CREATE INDEX "RecurringSchedule_tourId_isActive_idx" ON "RecurringSchedule"("tourId", "isActive");

-- CreateIndex
CREATE INDEX "BlackoutDate_date_idx" ON "BlackoutDate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BlackoutDate_tourId_date_key" ON "BlackoutDate"("tourId", "date");

-- CreateIndex
CREATE INDEX "Departure_departureDate_status_idx" ON "Departure"("departureDate", "status");

-- CreateIndex
CREATE INDEX "Departure_tourId_departureDate_status_idx" ON "Departure"("tourId", "departureDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Departure_tourId_departureDate_startTime_key" ON "Departure"("tourId", "departureDate", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_code_isActive_idx" ON "Promotion"("code", "isActive");

-- CreateIndex
CREATE INDEX "BookingQuote_expiresAt_idx" ON "BookingQuote"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_qrCheckinTokenHash_key" ON "Booking"("qrCheckinTokenHash");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_customerId_createdAt_idx" ON "Booking"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_departureId_status_idx" ON "Booking"("departureId", "status");

-- CreateIndex
CREATE INDEX "Booking_allocationActive_holdExpiresAt_idx" ON "Booking"("allocationActive", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Booking_allocationActive_decisionDeadlineAt_idx" ON "Booking"("allocationActive", "decisionDeadlineAt");

-- CreateIndex
CREATE INDEX "BookingNote_bookingId_idx" ON "BookingNote"("bookingId");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccessToken_tokenHash_key" ON "GuestAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestAccessToken_bookingId_revokedAt_idx" ON "GuestAccessToken"("bookingId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_bookingId_key" ON "PromotionRedemption"("bookingId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_customerEmail_status_idx" ON "PromotionRedemption"("promotionId", "customerEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_externalOrderId_key" ON "PaymentAttempt"("externalOrderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_bookingId_status_idx" ON "PaymentAttempt"("bookingId", "status");

-- CreateIndex
CREATE INDEX "PaymentProof_bookingId_status_idx" ON "PaymentProof"("bookingId", "status");

-- CreateIndex
CREATE INDEX "PaymentLedgerEntry_bookingId_createdAt_idx" ON "PaymentLedgerEntry"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentLedgerEntry_currency_type_createdAt_idx" ON "PaymentLedgerEntry"("currency", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_createdAt_idx" ON "PaymentWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "RefundRequest_bookingId_status_idx" ON "RefundRequest"("bookingId", "status");

-- CreateIndex
CREATE INDEX "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_publishedRevisionId_key" ON "CmsPage"("publishedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "CmsPage_currentDraftId_key" ON "CmsPage"("currentDraftId");

-- CreateIndex
CREATE INDEX "CmsPage_kind_idx" ON "CmsPage"("kind");

-- CreateIndex
CREATE INDEX "CmsRevision_pageId_status_idx" ON "CmsRevision"("pageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CmsRevision_pageId_revisionNumber_key" ON "CmsRevision"("pageId", "revisionNumber");

-- CreateIndex
CREATE INDEX "CmsPublishSchedule_status_scheduledForUtc_idx" ON "CmsPublishSchedule"("status", "scheduledForUtc");

-- CreateIndex
CREATE UNIQUE INDEX "CmsGlobalContent_key_key" ON "CmsGlobalContent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SlugRedirect_fromPath_key" ON "SlugRedirect"("fromPath");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxJob_dedupeKey_key" ON "OutboxJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxJob_status_runAfterUtc_idx" ON "OutboxJob"("status", "runAfterUtc");

-- CreateIndex
CREATE INDEX "OutboxJob_status_leasedUntilUtc_idx" ON "OutboxJob"("status", "leasedUntilUtc");

-- CreateIndex
CREATE INDEX "EmailDelivery_bookingId_idx" ON "EmailDelivery"("bookingId");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRecoveryCode" ADD CONSTRAINT "StaffRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PolicyDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupZone" ADD CONSTRAINT "PickupZone_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PolicyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_primaryMediaId_fkey" FOREIGN KEY ("primaryMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourCategory" ADD CONSTRAINT "TourCategory_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourCategory" ADD CONSTRAINT "TourCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAddon" ADD CONSTRAINT "TourAddon_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAddon" ADD CONSTRAINT "TourAddon_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "Addon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPickupZone" ADD CONSTRAINT "TourPickupZone_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPickupZone" ADD CONSTRAINT "TourPickupZone_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "PickupZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Departure" ADD CONSTRAINT "Departure_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "Departure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "Departure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccessToken" ADD CONSTRAINT "GuestAccessToken_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "CmsRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_currentDraftId_fkey" FOREIGN KEY ("currentDraftId") REFERENCES "CmsRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsRevision" ADD CONSTRAINT "CmsRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPublishSchedule" ADD CONSTRAINT "CmsPublishSchedule_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "CmsPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsPublishSchedule" ADD CONSTRAINT "CmsPublishSchedule_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CmsRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "OutboxJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Authoritative PostgreSQL Domain Check Constraints (Inventory & Financial Invariants)
ALTER TABLE "Departure"
  ADD CONSTRAINT "departure_capacity_nonnegative" CHECK ("capacity" >= 0),
  ADD CONSTRAINT "departure_booked_nonnegative" CHECK ("bookedSeats" >= 0),
  ADD CONSTRAINT "departure_held_nonnegative" CHECK ("heldSeats" >= 0),
  ADD CONSTRAINT "departure_allocated_within_capacity" CHECK ("bookedSeats" + "heldSeats" <= "capacity");

ALTER TABLE "Promotion"
  ADD CONSTRAINT "promotion_used_nonnegative" CHECK ("usedCount" >= 0),
  ADD CONSTRAINT "promotion_within_max_uses" CHECK ("maxTotalUses" IS NULL OR "usedCount" <= "maxTotalUses");

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_seats_positive" CHECK ("seatsAllocated" > 0),
  ADD CONSTRAINT "booking_grand_total_nonnegative" CHECK ("grandTotalMinor" >= 0),
  ADD CONSTRAINT "booking_due_now_nonnegative" CHECK ("dueNowMinor" >= 0),
  ADD CONSTRAINT "booking_due_later_nonnegative" CHECK ("dueLaterMinor" >= 0);

ALTER TABLE "PaymentLedgerEntry"
  ADD CONSTRAINT "ledger_amount_positive" CHECK ("amountMinor" > 0);
