import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { getAppEnv } from './common/env';

export async function createConfiguredApiApp(): Promise<NestExpressApplication> {
  const env = getAppEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === 'test' ? ['error', 'warn'] : ['log', 'error', 'warn'],
  });

  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Correlation ID, security headers, and Fetch Metadata resource isolation (exempting external webhooks)
  app.use((req: Request & { correlationId?: string }, res: Response, next: NextFunction) => {
    const corrId = (req.header('x-correlation-id') || crypto.randomUUID()).slice(0, 64);
    req.correlationId = corrId;
    res.setHeader('x-correlation-id', corrId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), focus-without-user-activation=()');
    res.setHeader('Vary', 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site');

    const isWebhook = req.path.startsWith('/api/v1/webhooks/');
    const fetchSite = req.header('sec-fetch-site');
    if (
      !isWebhook &&
      fetchSite &&
      !['same-origin', 'same-site', 'none'].includes(fetchSite) &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())
    ) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cross-site mutation blocked by Fetch Metadata policy',
          correlationId: corrId,
        },
      });
      return;
    }
    next();
  });

  // Strict single-origin CORS only when explicitly needed
  app.enableCors({
    origin: [env.PUBLIC_SITE_URL, env.WEB_INTERNAL_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token', 'idempotency-key', 'x-correlation-id'],
  });

  app.enableShutdownHooks();
  return app;
}

export function buildOpenApiDocument(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Sharm Pharaoh Travel API')
    .setDescription('Authoritative booking engine, CMS/Live Editor, RBAC admin, payments, and media API.')
    .setVersion('1.0.0')
    .addCookieAuth('spt_staff_session')
    .build();
  return SwaggerModule.createDocument(app, config);
}
