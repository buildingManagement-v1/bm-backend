import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreateParkingRegistrationDto } from './dto';
import { buildPageInfo } from 'src/common/pagination';

const registrationInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
  lease: { select: { id: true, carsAllowed: true } },
} satisfies Prisma.ParkingRegistrationInclude;

@Injectable()
export class ParkingService {
  constructor(private prisma: PrismaService) {}

  private normalizeLicensePlate(plate: string): string {
    return plate.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  async create(buildingId: string, dto: CreateParkingRegistrationDto) {
    const lease = await this.prisma.lease.findFirst({
      where: {
        buildingId,
        tenantId: dto.tenantId,
        unitId: dto.unitId,
        status: 'active',
      },
      select: { id: true, carsAllowed: true },
    });

    if (!lease) {
      throw new BadRequestException(
        'No active lease found for this tenant and unit in this building',
      );
    }

    const licensePlate = this.normalizeLicensePlate(dto.licensePlate);

    const existingCount = await this.prisma.parkingRegistration.count({
      where: { leaseId: lease.id },
    });

    if (existingCount >= lease.carsAllowed) {
      throw new BadRequestException(
        `Parking limit reached for this lease. Maximum ${lease.carsAllowed} car(s) allowed.`,
      );
    }

    const existingPlate = await this.prisma.parkingRegistration.findUnique({
      where: {
        leaseId_licensePlate: {
          leaseId: lease.id,
          licensePlate,
        },
      },
    });

    if (existingPlate) {
      throw new ConflictException(
        'This license plate is already registered for this unit.',
      );
    }

    const registration = await this.prisma.parkingRegistration.create({
      data: {
        buildingId,
        leaseId: lease.id,
        tenantId: dto.tenantId,
        unitId: dto.unitId,
        licensePlate,
      },
      include: registrationInclude,
    });

    return registration;
  }

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { q?: string; tenantId?: string; unitId?: string },
  ) {
    const where: Prisma.ParkingRegistrationWhereInput = { buildingId };

    if (filters?.tenantId) {
      where.tenantId = filters.tenantId;
    }
    if (filters?.unitId) {
      where.unitId = filters.unitId;
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { licensePlate: { contains: q, mode: 'insensitive' } },
        { tenant: { name: { contains: q, mode: 'insensitive' } } },
        { tenant: { email: { contains: q, mode: 'insensitive' } } },
        { unit: { unitNumber: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [totalCount, data] = await Promise.all([
      this.prisma.parkingRegistration.count({ where }),
      this.prisma.parkingRegistration.findMany({
        where,
        include: registrationInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async remove(id: string, buildingId: string) {
    const registration = await this.prisma.parkingRegistration.findFirst({
      where: { id, buildingId },
    });

    if (!registration) {
      throw new NotFoundException('Parking registration not found');
    }

    await this.prisma.parkingRegistration.delete({
      where: { id },
    });

    return { success: true };
  }
}
