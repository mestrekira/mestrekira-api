// src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuthController } from './admin-auth.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminJwtGuard } from './admin-jwt.guard';

// ✅ Importa módulos reais (injeção correta)
import { UsersModule } from '../users/users.module';
import { CleanupModule } from '../cleanup/cleanup.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    JwtModule.register({}), // usamos JwtService; secret é passado no sign()
    UsersModule,
    CleanupModule,
    MailModule,
  ],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, AdminJwtStrategy, AdminJwtGuard],
})
export class AdminModule {}
