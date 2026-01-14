import { NotificationType, UserType } from 'generated/prisma/client';

export class CreateNotificationDto {
  userId: string;
  userType: UserType;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}
