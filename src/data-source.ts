import 'reflect-metadata';
import { DataSource } from 'typeorm';

const hasDbUrl =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '';

const dbSsl =
  (process.env.DB_SSL || '').toLowerCase() === 'true' ||
  (process.env.PGSSLMODE || '').toLowerCase() === 'require';

export const AppDataSource = new DataSource(
  hasDbUrl
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
        extra: dbSsl ? { ssl: { rejectUnauthorized: false } } : undefined,

        // entidades no build
        entities: ['dist/**/*.entity.{js,ts}'],

        // migrations no build
        migrations: ['dist/migrations/*.{js,ts}'],

        synchronize: false,
        logging: false,
      }
    : {
        type: 'sqlite',
        database: 'database.sqlite',

        entities: ['dist/**/*.entity.{js,ts}'],
        migrations: ['dist/migrations/*.{js,ts}'],

        synchronize: false,
        logging: false,
      },
);
