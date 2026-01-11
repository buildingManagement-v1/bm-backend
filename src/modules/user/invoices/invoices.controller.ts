import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { ManagerRole } from 'generated/prisma/client';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import type { Response } from 'express';

@Controller('v1/app/invoices')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async findAll(@BuildingId() buildingId: string) {
    const result = await this.invoicesService.findAll(buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const result = await this.invoicesService.findOne(id, buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id/download')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async downloadInvoice(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfDoc = await this.invoicesService.downloadInvoice(id, buildingId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoice-${id}.pdf`,
    );

    pdfDoc.pipe(res);
  }
}
