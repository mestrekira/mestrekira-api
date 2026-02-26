import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoomEntity, TaskEntity, EssayEntity])],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
