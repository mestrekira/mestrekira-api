import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: (process.env.DB_TYPE as any) || 'sqlite',

      // ✅ Postgres no Render (quando DATABASE_URL existir)
      url: process.env.DATABASE_URL || undefined,

      // ✅ fallback local (SQLite) se você rodar localmente sem DATABASE_URL
      database: process.env.DATABASE_URL ? undefined : 'database.sqlite',

      entities: [__dirname + '/**/*.entity{.ts,.js}'],

      // ⚠️ Em produção o ideal é migrations; por enquanto pode manter
      synchronize: process.env.SYNC_DB === 'true',
    }),

    UsersModule,
    RoomsModule,
    TasksModule,
    EssaysModule,
    EnrollmentsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
