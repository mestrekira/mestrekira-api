import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { UserEntity } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    MailModule,
    forwardRef(() => UsersModule),

    JwtModule.register({
      secret:
        (process.env.JWT_SECRET || '').trim() ||
        'DEV_ONLY_CHANGE_ME__MESTRE_KIRA',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '').trim() || '7d',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
