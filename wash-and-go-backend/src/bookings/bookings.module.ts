import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [AuthModule, EmailModule, MembershipsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
