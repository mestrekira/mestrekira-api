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
    (process.env.JWT_SECRET || '').trim() || 'DEV_ONLY_CHANGE_ME__MESTRE_KIRA',
  signOptions: {
    expiresIn: (() => {
      const raw = (process.env.JWT_EXPIRES_IN || '').trim() || '7d';

      // se for número puro (ex: "3600"), vira number
      if (/^\d+$/.test(raw)) return Number(raw);

      // senão assume formato do jsonwebtoken (ex: "7d", "12h", "30m")
      return raw as any; // (resolve o TS2322 sem quebrar runtime)
    })(),
  },
}),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

