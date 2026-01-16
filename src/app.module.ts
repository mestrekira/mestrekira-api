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
      type: 'postgres',
      url: process.env.DATABASE_URL,

      // Supabase normalmente exige SSL em produção
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,

      entities: [__dirname + '/**/*.entity{.ts,.js}'],

      // ok para a fase atual; depois a gente troca para migrations
      synchronize: true,
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
