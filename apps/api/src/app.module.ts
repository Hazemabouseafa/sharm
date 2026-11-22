import { Module } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { RateLimitService } from './common/rate-limit.service';
import { StaffAuthGuard } from './common/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { CatalogService } from './catalog/catalog.service';
import { AdminCatalogController, PublicCatalogController } from './catalog/catalog.controller';
import { AvailabilityService } from './availability/availability.service';
import { AvailabilityController } from './availability/availability.controller';
import { VoucherService } from './booking/voucher.service';
import { BookingService } from './booking/booking.service';
import { AdminBookingController, PublicBookingController } from './booking/booking.controller';
import { MediaService } from './media/media.service';
import { AdminMediaController, PublicMediaController } from './media/media.controller';
import { PaymobAdapter } from './payments/paymob.adapter';
import { PaymentsService } from './payments/payments.service';
import { AdminPaymentsController, PublicPaymentsController } from './payments/payments.controller';
import { CmsService } from './cms/cms.service';
import { AdminCmsController, PublicCmsController } from './cms/cms.controller';
import { CrmService } from './crm/crm.service';
import { AdminCrmController, PublicInquiriesController } from './crm/crm.controller';
import { AdminService } from './admin/admin.service';
import { AdminController, HealthController } from './admin/admin.controller';
import { TranslationController } from './translation/translation.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    PublicCatalogController,
    AdminCatalogController,
    AvailabilityController,
    PublicBookingController,
    AdminBookingController,
    PublicMediaController,
    AdminMediaController,
    PublicPaymentsController,
    AdminPaymentsController,
    PublicCmsController,
    AdminCmsController,
    PublicInquiriesController,
    AdminCrmController,
    AdminController,
    TranslationController,
  ],
  providers: [
    PrismaService,
    AuditService,
    RateLimitService,
    StaffAuthGuard,
    AuthService,
    CatalogService,
    AvailabilityService,
    VoucherService,
    BookingService,
    MediaService,
    PaymobAdapter,
    PaymentsService,
    CmsService,
    CrmService,
    AdminService,
  ],
})
export class AppModule {}
