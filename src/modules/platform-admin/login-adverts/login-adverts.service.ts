import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdvertAudience, Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { deleteUpload, saveUpload } from 'src/common/uploads/uploads.util';
import { toUtcDate } from 'src/common/lease/lease-cycles.util';
import { CreateLoginAdvertDto, UpdateLoginAdvertDto } from './dto';

type Admin = { id: string; name: string };
type ImageFile = { buffer: Buffer } | undefined;

/** Public shape: the image is served by id, not by storage path. */
function present(advert: {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  audience: AdvertAudience;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: advert.id,
    title: advert.title,
    description: advert.description,
    linkUrl: advert.linkUrl,
    audience: advert.audience,
    isActive: advert.isActive,
    startsAt: advert.startsAt,
    endsAt: advert.endsAt,
    sortOrder: advert.sortOrder,
    imageUrl: `/v1/platform/login-adverts/${advert.id}/image`,
    createdAt: advert.createdAt,
    updatedAt: advert.updatedAt,
  };
}

@Injectable()
export class LoginAdvertsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findAll() {
    const adverts = await this.prisma.loginAdvert.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return adverts.map(present);
  }

  /** Adverts to show right now to the given audience. */
  async findLive(audience?: string) {
    const now = new Date();
    const audiences: AdvertAudience[] = ['all'];
    if (audience && ['owner', 'manager', 'tenant'].includes(audience)) {
      audiences.push(audience as AdvertAudience);
    }
    const adverts = await this.prisma.loginAdvert.findMany({
      where: {
        isActive: true,
        audience: { in: audiences },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    });
    return adverts.map(present);
  }

  async imagePath(id: string): Promise<string> {
    const advert = await this.prisma.loginAdvert.findUnique({
      where: { id },
      select: { imageUrl: true },
    });
    if (!advert) throw new NotFoundException('Advert not found');
    return advert.imageUrl;
  }

  async create(dto: CreateLoginAdvertDto, image: ImageFile, admin: Admin) {
    const window = this.window(dto.startsAt, dto.endsAt);
    const imageUrl = await saveUpload(image, 'adverts', {
      allowPdf: false,
      label: 'Banner image',
    });
    const advert = await this.prisma.loginAdvert.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        linkUrl: dto.linkUrl || null,
        audience: dto.audience ?? 'all',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        imageUrl,
        createdById: admin.id,
        ...window,
      },
    });
    await this.log('create', advert.id, admin, { title: advert.title });
    return present(advert);
  }

  async update(
    id: string,
    dto: UpdateLoginAdvertDto,
    image: ImageFile,
    admin: Admin,
  ) {
    const existing = await this.prisma.loginAdvert.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Advert not found');

    // undefined keeps the stored date, '' clears it
    const window = this.window(
      dto.startsAt !== undefined
        ? dto.startsAt
        : existing.startsAt?.toISOString(),
      dto.endsAt !== undefined ? dto.endsAt : existing.endsAt?.toISOString(),
    );
    const imageUrl = image?.buffer?.length
      ? await saveUpload(image, 'adverts', {
          allowPdf: false,
          label: 'Banner image',
        })
      : undefined;

    const advert = await this.prisma.loginAdvert.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description !== undefined
            ? dto.description.trim() || null
            : undefined,
        linkUrl: dto.linkUrl !== undefined ? dto.linkUrl || null : undefined,
        audience: dto.audience,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
        ...window,
        ...(imageUrl && { imageUrl }),
      },
    });
    if (imageUrl) await deleteUpload(existing.imageUrl);
    await this.log('update', id, admin, { changes: { ...dto } });
    return present(advert);
  }

  async remove(id: string, admin: Admin) {
    const existing = await this.prisma.loginAdvert.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Advert not found');
    await this.prisma.loginAdvert.delete({ where: { id } });
    await deleteUpload(existing.imageUrl);
    await this.log('delete', id, admin, { title: existing.title });
    return { message: 'Advert deleted' };
  }

  private window(startsAt?: string, endsAt?: string) {
    const start = startsAt ? toUtcDate(startsAt) : null;
    // An end date runs through the end of that day
    const end = endsAt
      ? new Date(toUtcDate(endsAt).getTime() + 24 * 60 * 60 * 1000 - 1)
      : null;
    if (start && end && end < start) {
      throw new BadRequestException('End date must be after the start date');
    }
    return { startsAt: start, endsAt: end };
  }

  private async log(
    action: 'create' | 'update' | 'delete',
    entityId: string,
    admin: Admin,
    details: Record<string, unknown>,
  ) {
    await this.activityLogsService.createPlatformLog({
      action,
      entityType: 'login_advert',
      entityId,
      adminId: admin.id,
      adminName: admin.name,
      details: details as Prisma.InputJsonValue,
    });
  }
}
