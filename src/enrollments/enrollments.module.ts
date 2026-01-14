import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentEntity } from './enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnrollmentEntity,
      RoomEntity,
      UserEntity, // 🔥 necessário para listar alunos com nome/email
    ]),
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}
