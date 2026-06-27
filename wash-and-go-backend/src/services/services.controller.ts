import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  /** PATCH /api/services/:id — Update service prices/details (admin only) */
  @UseGuards(SupabaseAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto, @CurrentUser() user: any) {
    return this.servicesService.update(id, dto, user.id);
  }
}
