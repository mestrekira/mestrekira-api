import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminAuthController } from './admin-auth.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminJwtGuard } from './admin-jwt.guard';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CleanupService } from '../cleanup/cleanup.service';

@Module({
  imports: [
    JwtModule.register({}), // usamos JwtService, secret fica no sign()
    TypeOrmModule.forFeature([UserEntity, RoomEntity, TaskEntity, EssayEntity]),
  ],
  controllers: [AdminAuthController, AdminController],
  providers: [
    AdminService,
    AdminJwtStrategy,
    AdminJwtGuard,

    // para ações manuais de aviso/exclusão
    UsersService,
    MailService,
    CleanupService,
  ],
})
export class AdminModule {}
