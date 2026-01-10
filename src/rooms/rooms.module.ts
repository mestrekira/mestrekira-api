import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RoomEntity, EnrollmentEntity])],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
