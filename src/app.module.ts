import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';

const hasDbUrl =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '';

const dbSsl =
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  (process.env.PGSSLMODE || '').toLowerCase() === 'require';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: hasDbUrl ? 'postgres' : 'sqlite',

      // Postgres no Render
      url: hasDbUrl ? process.env.DATABASE_URL : undefined,

      // SQLite local
      database: hasDbUrl ? undefined : 'database.sqlite',

      autoLoadEntities: true,

      synchronize: (process.env.SYNC_DB || '').toLowerCase() === 'true',

      ...(hasDbUrl && dbSsl
        ? {
            ssl: { rejectUnauthorized: false },
            extra: { ssl: { rejectUnauthorized: false } },
          }
        : {}),
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
