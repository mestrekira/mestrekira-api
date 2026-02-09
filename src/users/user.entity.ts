import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column({ default: 'student' })
  role: string;

  // ✅ controle do aviso/exclusão por inatividade
  @Column({ type: 'timestamptz', nullable: true })
  inactivityWarnedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledDeletionAt: Date | null;

  // ✅ opt-out de e-mails (já existe no seu banco)
  @Column({ type: 'boolean', default: false })
  emailOptOut: boolean;

  // ✅ verificação de e-mail
  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  emailVerifyTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifyTokenExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ✅ recuperação de senha
  @Column({ type: 'text', nullable: true })
  passwordResetTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt: Date | null;
}

