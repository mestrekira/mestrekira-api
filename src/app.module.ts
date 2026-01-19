import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';

const hasDbUrl = !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: hasDbUrl ? 'postgres' : 'sqlite',

      // Postgres no Render
      url: hasDbUrl ? process.env.DATABASE_URL : undefined,

      // SQLite local
      database: hasDbUrl ? undefined : 'database.sqlite',

      entities: [__dirname + '/**/*.entity{.ts,.js}'],

      synchronize: (process.env.SYNC_DB || '').toLowerCase() === 'true',

      // ✅ Render/PG às vezes exige SSL dependendo do provedor.
      // Se seu Postgres for do próprio Render, geralmente funciona sem ssl.
      // Se der erro de SSL, descomente isso:
      // ssl: hasDbUrl ? { rejectUnauthorized: false } : undefined,
      // extra: hasDbUrl ? { ssl: { rejectUnauthorized: false } } : undefined,
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
