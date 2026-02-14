import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';

import { EssaysModule } from '../essays/essays.module';
import { RoomsModule } from '../rooms/rooms.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';

import { UserEntity } from '../users/user.entity';

@Module({
  imports: [
    EssaysModule,
    RoomsModule,
    TasksModule,
    UsersModule,

    // ✅ necessário para usar @InjectRepository(UserEntity)
    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
