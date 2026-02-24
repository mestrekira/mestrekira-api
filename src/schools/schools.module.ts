import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RoomEntity]),
    PassportModule, // para AuthGuard('jwt')
  ],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}