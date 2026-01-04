import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RequestWithBuildingId extends Request {
  buildingId?: string;
}

@Injectable()
export class BuildingContextMiddleware implements NestMiddleware {
  use(req: RequestWithBuildingId, res: Response, next: NextFunction) {
    const buildingId = req.headers['x-building-id'] as string;

    if (!buildingId) {
      throw new BadRequestException('X-Building-Id header is required');
    }

    // Attach buildingId to request
    // Access validation will be done in the guard
    req.buildingId = buildingId;
    console.log('Middleware - req.buildingId set:', req.buildingId); // ADD THIS
    next();
  }
}
