import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { StorageEngine } from 'multer';
import multer from 'multer';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { streamUpload } from 'src/common/uploads/uploads.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginAdvertsService } from './login-adverts.service';
import { CreateLoginAdvertDto, UpdateLoginAdvertDto } from './dto';

const imageUpload = FileInterceptor('image', {
  limits: { fileSize: 3 * 1024 * 1024 },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- multer default export typings unresolved
  storage: (multer as { memoryStorage: () => StorageEngine }).memoryStorage(),
});

@ApiTags('Login Adverts')
@Controller('v1/platform/login-adverts')
export class LoginAdvertsController {
  constructor(
    private readonly advertsService: LoginAdvertsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('public')
  @ApiOperation({
    summary: 'Adverts to show on a login screen (no auth)',
  })
  async live(@Query('audience') audience?: string) {
    return {
      success: true,
      data: await this.advertsService.findLive(audience),
    };
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Advert banner image (no auth)' })
  async image(@Param('id', new ParseUUIDPipe()) id: string) {
    return streamUpload(await this.advertsService.imagePath(id));
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @ApiOperation({ summary: 'All adverts (admin)' })
  async findAll() {
    return { success: true, data: await this.advertsService.findAll() };
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create an advert (image required)' })
  async create(
    @Body() dto: CreateLoginAdvertDto,
    @UploadedFile() image: { buffer: Buffer } | undefined,
    @User() user: { id: string },
  ) {
    return {
      success: true,
      data: await this.advertsService.create(
        dto,
        image,
        await this.admin(user.id),
      ),
      message: 'Advert created',
    };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update an advert (image optional)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLoginAdvertDto,
    @UploadedFile() image: { buffer: Buffer } | undefined,
    @User() user: { id: string },
  ) {
    return {
      success: true,
      data: await this.advertsService.update(
        id,
        dto,
        image,
        await this.admin(user.id),
      ),
      message: 'Advert updated',
    };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @ApiOperation({ summary: 'Delete an advert' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User() user: { id: string },
  ) {
    return {
      success: true,
      data: await this.advertsService.remove(id, await this.admin(user.id)),
    };
  }

  private async admin(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    return admin ?? { id, name: 'Unknown admin' };
  }
}
