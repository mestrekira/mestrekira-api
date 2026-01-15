import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity, EnrollmentEntity, EssayEntity])
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}

