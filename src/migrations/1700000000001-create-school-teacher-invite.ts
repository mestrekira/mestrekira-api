import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchoolTeacherInvite1700000000001
  implements MigrationInterface
{
  name = 'CreateSchoolTeacherInvite1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    if (type === 'postgres') {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "school_teacher_invite" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "schoolId" uuid NOT NULL,
          "teacherEmail" text NOT NULL,
          "teacherName" text,
          "codeHash" text NOT NULL,
          "expiresAt" timestamptz NOT NULL,
          "usedAt" timestamptz,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT "PK_school_teacher_invite_id" PRIMARY KEY ("id")
        )
      `);

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_invite_teacherEmail" ON "school_teacher_invite" ("teacherEmail")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_invite_schoolId" ON "school_teacher_invite" ("schoolId")`,
      );
    } else {
      // SQLite
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "school_teacher_invite" (
          "id" varchar PRIMARY KEY NOT NULL,
          "schoolId" varchar NOT NULL,
          "teacherEmail" varchar NOT NULL,
          "teacherName" varchar,
          "codeHash" varchar NOT NULL,
          "expiresAt" datetime NOT NULL,
          "usedAt" datetime,
          "createdAt" datetime NOT NULL
        )
      `);

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_invite_teacherEmail" ON "school_teacher_invite" ("teacherEmail")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_invite_schoolId" ON "school_teacher_invite" ("schoolId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_teacher_invite"`);
  }
}
