import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoomActiveColumns1711410000000 implements MigrationInterface {
  name = 'AddRoomActiveColumns1711410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "room_entity"
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "room_entity"
      ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      UPDATE "room_entity"
      SET "isActive" = true
      WHERE "isActive" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "room_entity"
      DROP COLUMN IF EXISTS "deactivatedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "room_entity"
      DROP COLUMN IF EXISTS "isActive"
    `);
  }
}
