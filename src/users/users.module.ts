import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserEntity } from './user.entity';

import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';

import { MailModule } from '../mail/mail.module'; // ✅ IMPORTAR

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      EssayEntity,
      RoomEntity,
      EnrollmentEntity,
      TaskEntity,
    ]),
    MailModule, // ✅ ADICIONAR
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
