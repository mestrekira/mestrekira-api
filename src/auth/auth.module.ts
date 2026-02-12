import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UserEntity } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// ✅ adicione estes imports (crie os arquivos se ainda não existirem)
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    MailModule,
    forwardRef(() => UsersModule),

    // ✅ necessário para o AuthGuard('jwt') funcionar
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({
      secret:
        (process.env.JWT_SECRET || '').trim() || 'DEV_ONLY_CHANGE_ME__MESTRE_KIRA',
      signOptions: {
        // ✅ evita o TS2322 sem "as any" e sem quebrar runtime
        expiresIn: (() => {
          const raw = (process.env.JWT_EXPIRES_IN || '').trim() || '7d';
          return /^\d+$/.test(raw) ? Number(raw) : raw;
        })(),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,

    // ✅ registra o strategy do Passport/JWT
    JwtStrategy,
  ],
  exports: [
    AuthService,
    JwtModule,
    PassportModule, // ✅ útil para outros módulos usarem guards
  ],
})
export class AuthModule {}
