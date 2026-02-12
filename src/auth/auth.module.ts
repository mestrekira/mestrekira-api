import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';

import { UserEntity } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

function jwtExpiresIn(): number | StringValue {
  const raw = (process.env.JWT_EXPIRES_IN || '').trim() || '7d';

  // "3600" => 3600
  if (/^\d+$/.test(raw)) return Number(raw);

  // "7d", "12h", "30m", "1h", etc => StringValue
  return raw as StringValue;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    MailModule,
    forwardRef(() => UsersModule),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({
      secret:
        (process.env.JWT_SECRET || '').trim() || 'DEV_ONLY_CHANGE_ME__MESTRE_KIRA',
      signOptions: {
        expiresIn: jwtExpiresIn(),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
