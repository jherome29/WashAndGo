import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MembershipsService } from './memberships.service';
import { IssueMembershipDto } from './dto/issue-membership.dto';
import { VehicleDto } from './dto/vehicle.dto';
import { CancelMembershipDto } from './dto/cancel-membership.dto';
import { LookupMembershipDto } from './dto/lookup-membership.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('memberships')
export class MembershipsController {
  constructor(private membershipsService: MembershipsService) {}

  /** POST /api/memberships — Issue a new membership (admin only) */
  @UseGuards(SupabaseAuthGuard)
  @Post()
  issue(@Body() dto: IssueMembershipDto, @CurrentUser() user: any) {
    return this.membershipsService.issue(dto, user.id);
  }

  /** POST /api/memberships/lookup — Guest lookup by membership number */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('lookup')
  lookup(@Body() dto: LookupMembershipDto) {
    return this.membershipsService.lookupByNo(dto.membershipNo);
  }

  /** GET /api/memberships/vehicle-status?plateNumber= — Public: discount preview for the booking wizard */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('vehicle-status')
  getVehicleStatus(@Query('plateNumber') plateNumber: string) {
    return this.membershipsService.getVehicleStatus(plateNumber);
  }

  /** GET /api/memberships/me — Logged-in customer's own membership, or null */
  @UseGuards(SupabaseAuthGuard)
  @Get('me')
  findMine(@CurrentUser() user: any) {
    return this.membershipsService.findMine(user.id);
  }

  /** GET /api/memberships?search= — Admin search by member name or membership no. */
  @UseGuards(SupabaseAuthGuard)
  @Get()
  findAll(@Query('search') search: string | undefined, @CurrentUser() user: any) {
    return this.membershipsService.findAll(search, user.id);
  }

  /** GET /api/memberships/customer-search?query= — Admin: find an existing account by name/phone/email */
  @UseGuards(SupabaseAuthGuard)
  @Get('customer-search')
  searchCustomers(@Query('query') query: string, @CurrentUser() user: any) {
    return this.membershipsService.searchCustomers(query || '', user.id);
  }

  /** GET /api/memberships/customers/:userId/carwash-history — Admin: an account's car-wash-only booking history */
  @UseGuards(SupabaseAuthGuard)
  @Get('customers/:userId/carwash-history')
  getCustomerCarwashHistory(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.membershipsService.getCustomerCarwashHistory(userId, user.id);
  }

  /** GET /api/memberships/:id — Admin detail view */
  @UseGuards(SupabaseAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.findOne(id, user.id);
  }

  /** POST /api/memberships/:id/renew — Admin renews for another year */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/renew')
  renew(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.renew(id, user.id);
  }

  /** POST /api/memberships/:id/cancel — Admin cancels a membership */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelMembershipDto, @CurrentUser() user: any) {
    return this.membershipsService.cancel(id, user.id, dto.reason);
  }

  /** POST /api/memberships/:id/visits/increment — Admin logs a walk-in car-wash visit */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/visits/increment')
  incrementVisit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.incrementVisit(id, user.id);
  }

  /** POST /api/memberships/:id/visits/decrement — Admin undoes an accidental visit log */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/visits/decrement')
  decrementVisit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.membershipsService.decrementVisit(id, user.id);
  }

  /** POST /api/memberships/:id/vehicles — Admin adds a vehicle (capped at 3) */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/vehicles')
  addVehicle(@Param('id') id: string, @Body() dto: VehicleDto, @CurrentUser() user: any) {
    return this.membershipsService.addVehicle(id, dto, user.id);
  }

  /** DELETE /api/memberships/:id/vehicles/:vehicleId — Admin removes a vehicle */
  @UseGuards(SupabaseAuthGuard)
  @Delete(':id/vehicles/:vehicleId')
  removeVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ) {
    return this.membershipsService.removeVehicle(id, vehicleId, user.id);
  }
}
