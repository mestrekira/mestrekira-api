import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';

const isProd = process.env.NODE_ENV === 'production';
const hasDbUrl = !!process.env.DATABASE_URL;

// Render Postgres normalmente precisa de SSL
const useSsl = isProd && hasDbUrl;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: hasDbUrl ? 'postgres' : 'sqlite',

      // ✅ Produção (Render): Postgres via DATABASE_URL
      url: hasDbUrl ? process.env.DATABASE_URL : undefined,

      // ✅ Local: SQLite
      database: hasDbUrl ? undefined : 'database.sqlite',

      entities: [__dirname + '/**/*.entity{.ts,.js}'],

      // ⚠️ mantenha true só enquanto está em fase de testes
      synchronize: process.env.SYNC_DB === 'true',

      // ✅ SSL no Render (Postgres)
      ssl: useSsl ? { rejectUnauthorized: false } : false,
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
