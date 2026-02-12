import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';

// ✅ ajuste imports dos seus módulos reais:
import { EssaysModule } from '../essays/essays.module';
import { RoomsModule } from '../rooms/rooms.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [EssaysModule, RoomsModule, TasksModule, UsersModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
