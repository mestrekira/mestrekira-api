import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { UserEntity } from '../users/user.entity';
import { SchoolTeacherInviteEntity } from './school-teacher-invite.entity';
import { SchoolTeacherController } from './school-teacher.controller';
import { SchoolTeacherService } from './school-teacher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SchoolTeacherInviteEntity]),
    JwtModule.register({}),
  ],
  controllers: [SchoolTeacherController],
  providers: [SchoolTeacherService],
})
export class SchoolTeacherModule {}