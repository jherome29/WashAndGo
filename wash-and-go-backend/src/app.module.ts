import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { BookingsModule } from './bookings/bookings.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { ShopSettingsModule } from './shop-settings/shop-settings.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), '.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    SupabaseModule,
    AuthModule,
    ServicesModule,
    BookingsModule,
    StorageModule,
    EmailModule,
    AdminModule,
    ShopSettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
