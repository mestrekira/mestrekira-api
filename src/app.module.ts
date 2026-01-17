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
      // ✅ Se existir DATABASE_URL => Postgres (Render)
      // ✅ Se não existir => SQLite (local)
      type: process.env.DATABASE_URL ? 'postgres' : 'sqlite',

      url: process.env.DATABASE_URL,

      // Só usa database quando for sqlite
      database: process.env.DATABASE_URL ? undefined : 'database.sqlite',

      entities: [__dirname + '/**/*.entity{.ts,.js}'],

      // ⚠️ ok por enquanto (fase TCC). Depois o ideal é migrations.
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
