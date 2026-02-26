import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'school_teacher_invites' })
export class SchoolTeacherInviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  schoolId: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  teacherEmail: string;

  @Column({ type: 'varchar', length: 64 })
  code: string; // token curto (não é senha)

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
