import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchoolDashboardController } from './school-dashboard.controller';
import { SchoolDashboardService } from './school-dashboard.service';

import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';
import { SchoolYearEntity } from './school-year.entity';

import { RoomsModule } from '../rooms/rooms.module';
import { EssaysModule } from '../essays/essays.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoomEntity, UserEntity, SchoolYearEntity]),
    RoomsModule,  // para usar RoomsService.overview
    EssaysModule, // se você quiser usar EssaysService direto depois
  ],
  controllers: [SchoolDashboardController],
  providers: [SchoolDashboardService],
  exports: [SchoolDashboardService],
})
export class SchoolDashboardModule {}
