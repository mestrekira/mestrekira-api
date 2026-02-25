import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';

import { RoomsModule } from '../rooms/rooms.module'; // ✅ IMPORTANTE

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskEntity,
      EnrollmentEntity,
      EssayEntity,
      RoomEntity,
    ]),

    RoomsModule, // ✅ disponibiliza RoomsService no contexto do TasksModule
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
