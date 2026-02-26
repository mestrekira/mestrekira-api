import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EssaysController } from './essays.controller';
import { EssaysService } from './essays.service';

import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';

import { TasksModule } from '../tasks/tasks.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    // ✅ Repositórios usados pelo EssaysService (e/ou queries auxiliares)
    TypeOrmModule.forFeature([
      EssayEntity,
      UserEntity,
      TaskEntity,

      // ✅ se seu EssaysService usa Enrollment/Room em algum ponto (se não usar, pode remover)
      EnrollmentEntity,
      RoomEntity,
    ]),

    // ✅ Para DI no CONTROLLER (TasksService e RoomsService)
    TasksModule,
    RoomsModule,
  ],
  controllers: [EssaysController],
  providers: [EssaysService],
  exports: [EssaysService],
})
export class EssaysModule {}
