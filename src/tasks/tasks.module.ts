import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';

import { RoomsModule } from '../rooms/rooms.module'; // ✅ ADD

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskEntity,
      EnrollmentEntity,
      EssayEntity,
      RoomEntity,
    ]),

    RoomsModule, // ✅ ADD (fornece RoomsService)
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
