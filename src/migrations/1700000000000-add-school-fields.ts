import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolFields1700000000000 implements MigrationInterface {
  name = 'AddSchoolFields1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    if (type === 'postgres') {
      // ----------------------------
      // user_entity
      // ----------------------------
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "professorType" text`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "schoolId" uuid`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "trialMode" boolean NOT NULL DEFAULT false`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN IF NOT EXISTS "paymentCustomerId" text`,
      );

      // ----------------------------
      // room_entity
      // ----------------------------
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN IF NOT EXISTS "ownerType" text NOT NULL DEFAULT 'PROFESSOR'`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN IF NOT EXISTS "schoolId" uuid`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN IF NOT EXISTS "teacherId" uuid`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN IF NOT EXISTS "teacherNameSnapshot" text`,
      );

      // (opcional, mas recomendado) índices para consultas do painel escolar
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_room_schoolId" ON "room_entity" ("schoolId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_room_teacherId" ON "room_entity" ("teacherId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_schoolId" ON "user_entity" ("schoolId")`,
      );
    } else {
      // SQLite (ADD COLUMN funciona bem para colunas nullable/default simples)
      // ----------------------------
      // user_entity
      // ----------------------------
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "professorType" varchar`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "schoolId" varchar`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "trialMode" boolean NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "isActive" boolean NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" ADD COLUMN "paymentCustomerId" varchar`,
      );

      // ----------------------------
      // room_entity
      // ----------------------------
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN "ownerType" varchar NOT NULL DEFAULT 'PROFESSOR'`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN "schoolId" varchar`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN "teacherId" varchar`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" ADD COLUMN "teacherNameSnapshot" varchar`,
      );

      // índices no SQLite (IF NOT EXISTS funciona)
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_room_schoolId" ON "room_entity" ("schoolId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_room_teacherId" ON "room_entity" ("teacherId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_schoolId" ON "user_entity" ("schoolId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    // remover índices (se existirem)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_room_schoolId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_room_teacherId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_schoolId"`);

    if (type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "room_entity" DROP COLUMN IF EXISTS "teacherNameSnapshot"`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" DROP COLUMN IF EXISTS "teacherId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" DROP COLUMN IF EXISTS "schoolId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "room_entity" DROP COLUMN IF EXISTS "ownerType"`,
      );

      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "paymentCustomerId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "isActive"`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "trialMode"`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "mustChangePassword"`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "schoolId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "user_entity" DROP COLUMN IF EXISTS "professorType"`,
      );
    } else {
      // SQLite: DROP COLUMN depende da versão; para segurança, deixamos a reversão simples.
      // Se você realmente precisar de down no SQLite, fazemos por recriação de tabela.
      // (Mantendo como no-op para não quebrar ambientes.)
    }
  }
}