import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchoolDashboardController } from './school-dashboard.controller';
import { SchoolDashboardService } from './school-dashboard.service';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoomEntity, TaskEntity, EssayEntity])],
  controllers: [SchoolDashboardController],
  providers: [SchoolDashboardService],
})
export class SchoolDashboardModule {}