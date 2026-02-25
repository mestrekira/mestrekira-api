import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { EssaysModule } from './essays/essays.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { PdfModule } from './pdf/pdf.module';
import { SchoolsModule } from './schools/schools.module';
import { SchoolTeacherModule } from './school-teacher/school-teacher.module';
import { AdminModule } from './admin/admin.module';

const hasDbUrl =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '';

const dbSsl =
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  (process.env.PGSSLMODE || '').toLowerCase() === 'require';

// ✅ Só permite synchronize fora de production (segurança)
const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const syncRequested = (process.env.SYNC_DB || '').toLowerCase() === 'true';
const sync = !isProd && syncRequested;

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

console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] hasDbUrl:', hasDbUrl);
console.log(
  '[DB] DATABASE_URL startsWith postgres:',
  (process.env.DATABASE_URL || '').startsWith('postgres'),
);
console.log('[DB] SYNC_DB (requested):', process.env.SYNC_DB);
console.log('[DB] synchronize (effective):', sync);
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
    AuthModule,
    RoomsModule,
    TasksModule,
    EssaysModule,
    EnrollmentsModule,
    AnalyticsModule,
    CleanupModule,
    PdfModule,
    SchoolsModule,
    SchoolTeacherModule,
    AdminModule,
  ],
})
export class AppModule {}




