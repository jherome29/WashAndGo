import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { Logger, ValidationPipe } from '@nestjs/common';
import { setDefaultResultOrder } from 'node:dns';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    // Prefer IPv4 for outbound DNS resolution (helps avoid SMTP IPv6 ENETUNREACH on some hosts).
    setDefaultResultOrder('ipv4first');
  } catch (error) {
    logger.warn(`Unable to set DNS result order to ipv4first: ${(error as Error)?.message || error}`);
  }
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '50kb' }));
  app.use(urlencoded({ extended: true, limit: '50kb' }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, '');
  const normalizeConfiguredOrigin = (value: string): string => {
    const cleaned = stripQuotes(value.trim()).replace(/\/+$/, '');
    if (!cleaned) return '';
    if (cleaned.includes('*')) return cleaned;
    try {
      return new URL(cleaned).origin;
    } catch {
      return cleaned;
    }
  };
  const normalizeRequestOrigin = (value: string): string => {
    const cleaned = stripQuotes(value.trim()).replace(/\/+$/, '');
    try {
      return new URL(cleaned).origin;
    } catch {
      return cleaned;
    }
  };
  const configuredCORSOrigins = stripQuotes(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '');
  const configuredOrigins = [
    ...configuredCORSOrigins
      .split(',')
      .map((origin) => normalizeConfiguredOrigin(origin))
      .filter(Boolean),
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3005',
    'https://wash-and-go-front-back.pages.dev',
    'https://*.wash-and-go-front-back.pages.dev',
    'https://wash-and-go-front-back-*.vercel.app',
    'https://wash-and-go-front-back*.vercel.app',
  ]
    .map((origin) => normalizeConfiguredOrigin(origin))
    .filter(Boolean)
    .filter((origin, index, all) => all.indexOf(origin) === index);

  const exactOrigins = configuredOrigins.filter((origin) => !origin.includes('*'));
  const wildcardOrigins = configuredOrigins
    .filter((origin) => origin.includes('*'))
    .map((origin) => new RegExp(`^${escapeRegex(origin).replace(/\\\*/g, '.*')}$`));

  const rawAllowVercel = stripQuotes(process.env.CORS_ALLOW_VERCEL ?? '');
  const allowAllVercelOrigins = rawAllowVercel.toLowerCase() === 'true';

  const isAllowedOrigin = (origin: string): boolean => {
    const normalizedOrigin = normalizeRequestOrigin(origin);
    if (exactOrigins.includes(normalizedOrigin)) return true;
    if (wildcardOrigins.some((pattern) => pattern.test(normalizedOrigin))) return true;

    if (!allowAllVercelOrigins) return false;

    try {
      return new URL(normalizedOrigin).hostname.endsWith('.vercel.app');
    } catch {
      return false;
    }
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);

      logger.warn(`Blocked CORS origin: ${origin} | allowed exact: ${exactOrigins.join(', ')} | wildcards: ${configuredOrigins.filter(o => o.includes('*')).join(', ')}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());

  const normalizedPort = Number.parseInt(stripQuotes(process.env.PORT || ''), 10);
  const port = Number.isFinite(normalizedPort) ? normalizedPort : 3001;
  const host = '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Application running on http://${host}:${port}/api`);
}
bootstrap();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
