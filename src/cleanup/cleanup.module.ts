import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CleanupService } from './cleanup.service';
import { CleanupController } from './cleanup.controller';

import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

import { UserEntity } from '../users/user.entity';
import { EssayEntity } from '../essays/essay.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      EssayEntity,
      EnrollmentEntity,
      RoomEntity,
      TaskEntity,
    ]),
    UsersModule,
    MailModule,
  ],
  controllers: [CleanupController],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class CleanupModule {}
