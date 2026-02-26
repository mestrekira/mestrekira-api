import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchoolTeacherInviteEntity } from './school-teacher-invite.entity';
import { UserEntity } from '../users/user.entity';

import { SchoolTeacherController } from './school-teacher.controller';
import { SchoolTeacherService } from './school-teacher.service';

@Module({
  imports: [TypeOrmModule.forFeature([SchoolTeacherInviteEntity, UserEntity])],
  controllers: [SchoolTeacherController],
  providers: [SchoolTeacherService],
  exports: [SchoolTeacherService],
})
export class SchoolTeacherModule {}
