import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EssaysController } from './essays.controller';
import { EssaysService } from './essays.service';
import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EssayEntity, UserEntity, TaskEntity])],
  controllers: [EssaysController],
  providers: [EssaysService],
  exports: [EssaysService],
})
export class EssaysModule {}

