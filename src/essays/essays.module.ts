import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EssaysController } from './essays.controller';
import { EssaysService } from './essays.service';

import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { SchoolYearEntity } from '../school-dashboard/school-year.entity';

import { TasksModule } from '../tasks/tasks.module';
import { RoomsModule } from '../rooms/rooms.module';
import { CleanupModule } from '../cleanup/cleanup.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EssayEntity,
      UserEntity,
      TaskEntity,
      EnrollmentEntity,
      RoomEntity,
      SchoolYearEntity,
    ]),
    TasksModule,
    RoomsModule,
    CleanupModule,
  ],
  controllers: [EssaysController],
  providers: [EssaysService],
  exports: [EssaysService],
})
export class EssaysModule {}
