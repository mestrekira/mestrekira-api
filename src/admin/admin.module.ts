import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminKeyGuard } from './admin-key.guard';
import { CleanupModule } from '../cleanup/cleanup.module';

@Module({
  imports: [CleanupModule],
  controllers: [AdminController],
  providers: [AdminKeyGuard],
})
export class AdminModule {}
