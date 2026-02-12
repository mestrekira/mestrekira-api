import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'user_entity' }) // use o nome real da sua tabela se for diferente
@Index(['email'], { unique: true })
export class UserEntity {
  // ================================
  // 🔹 Identificação básica
  // ================================

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  password: string;

  @Column({ type: 'text', default: 'student' })
  role: string; // 'student' | 'professor'


  // ================================
  // 🔹 Controle de inatividade
  // ================================

  @Column({ type: 'timestamptz', nullable: true })
  inactivityWarnedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledDeletionAt: Date | null;


  // ================================
  // 🔹 Preferências de e-mail
  // ================================

  @Column({ type: 'boolean', default: false })
  emailOptOut: boolean;


  // ================================
  // 🔹 Verificação de e-mail
  // ================================

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  emailVerifyTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifyTokenExpiresAt: Date | null;


  // ================================
  // 🔹 Recuperação de senha
  // ================================

  @Column({ type: 'text', nullable: true })
  passwordResetTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt: Date | null;


  // ================================
  // 🔹 Datas automáticas
  // ================================

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
