import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const now = () => new Date();

const softDeleteData = (at: Date, by: string) =>
  ({ deletedAt: at, deletedById: by }) as {
    deletedAt: Date;
    deletedById: string;
  };

@Injectable()
export class SoftDeleteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Soft-delete a building and cascade to units, tenants, leases, parking, maintenance, manager roles.
   */
  async softDeleteBuilding(
    buildingId: string,
    deletedById: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const at = now();
      const data = softDeleteData(at, deletedById);
      await tx.building.updateMany({ where: { id: buildingId }, data });
      await tx.unit.updateMany({ where: { buildingId }, data });
      await tx.tenant.updateMany({ where: { buildingId }, data });
      await tx.lease.updateMany({ where: { buildingId }, data });
      await tx.parkingRegistration.updateMany({ where: { buildingId }, data });
      await tx.maintenanceRequest.updateMany({ where: { buildingId }, data });
      await tx.managerBuildingRole.updateMany({ where: { buildingId }, data });
    });
  }

  async softDeleteUnit(unitId: string, deletedById: string): Promise<void> {
    await this.prisma.unit.updateMany({
      where: { id: unitId },
      data: softDeleteData(now(), deletedById),
    });
  }

  async softDeleteTenant(tenantId: string, deletedById: string): Promise<void> {
    await this.prisma.tenant.updateMany({
      where: { id: tenantId },
      data: softDeleteData(now(), deletedById),
    });
  }

  async softDeleteLease(leaseId: string, deletedById: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const at = now();
      const data = softDeleteData(at, deletedById);
      await tx.lease.updateMany({ where: { id: leaseId }, data });
      await tx.parkingRegistration.updateMany({ where: { leaseId }, data });
    });
  }

  async softDeleteParkingRegistration(
    id: string,
    deletedById: string,
  ): Promise<void> {
    await this.prisma.parkingRegistration.updateMany({
      where: { id },
      data: softDeleteData(now(), deletedById),
    });
  }

  async softDeleteMaintenanceRequest(
    id: string,
    deletedById: string,
  ): Promise<void> {
    await this.prisma.maintenanceRequest.updateMany({
      where: { id },
      data: softDeleteData(now(), deletedById),
    });
  }

  /**
   * Soft-delete a manager and their building role assignments.
   */
  async softDeleteManager(
    managerId: string,
    deletedById: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const at = now();
      const data = softDeleteData(at, deletedById);
      await tx.manager.updateMany({ where: { id: managerId }, data });
      await tx.managerBuildingRole.updateMany({ where: { managerId }, data });
    });
  }

  /**
   * Soft-delete a manager's assignment to a building (remove from building).
   */
  async softDeleteManagerBuildingRole(
    managerId: string,
    buildingId: string,
    deletedById: string,
  ): Promise<void> {
    await this.prisma.managerBuildingRole.updateMany({
      where: { managerId, buildingId },
      data: softDeleteData(now(), deletedById),
    });
  }
}
