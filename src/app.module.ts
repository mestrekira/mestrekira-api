import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CleanupModule } from './cleanup/cleanup.module'; // ✅ ADICIONAR

const hasDbUrl =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '';

const dbSsl =
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  (process.env.PGSSLMODE || '').toLowerCase() === 'require';

const sync = (process.env.SYNC_DB || '').toLowerCase() === 'true';

// ✅ config Postgres (Render)
const postgresConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  autoLoadEntities: true,
  synchronize: sync,

  // SSL opcional (Render costuma precisar)
  ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
  extra: dbSsl ? { ssl: { rejectUnauthorized: false } } : undefined,
};

// ✅ config SQLite (local)
const sqliteConfig: TypeOrmModuleOptions = {
  type: 'sqlite',
  database: 'database.sqlite',
  autoLoadEntities: true,
  synchronize: sync,
};

console.log('[DB] hasDbUrl:', hasDbUrl);
console.log(
  '[DB] DATABASE_URL startsWith postgres:',
  (process.env.DATABASE_URL || '').startsWith('postgres'),
);
console.log('[DB] SYNC_DB:', process.env.SYNC_DB);
console.log(
  '[DB] DB_SSL:',
  process.env.DB_SSL,
  'PGSSLMODE:',
  process.env.PGSSLMODE,
);

@Module({
  imports: [
    TypeOrmModule.forRoot(hasDbUrl ? postgresConfig : sqliteConfig),

    UsersModule,
    RoomsModule,
    TasksModule,
    EssaysModule,
    EnrollmentsModule,
    AnalyticsModule,
    CleanupModule, // ✅ agora compila
  ],
})
export class AppModule {}
