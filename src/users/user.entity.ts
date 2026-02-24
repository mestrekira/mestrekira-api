import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'user_entity' })
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

  /**
   * ✅ agora aceita: 'student' | 'professor' | 'school'
   * (mantém default student para não quebrar usuários antigos)
   */
  @Column({ type: 'text', default: 'student' })
  role: string;

  // ================================
  // 🔹 Perfil escolar / professor gerenciado
  // ================================
  /**
   * Para professor:
   * - INDIVIDUAL = professor normal
   * - SCHOOL = professor cadastrado pela escola
   */
  @Column({ type: 'text', nullable: true })
  professorType: string | null; // 'INDIVIDUAL' | 'SCHOOL'

  /**
   * Se professor for gerenciado por escola, aponta para a escola (User role=school)
   */
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  /**
   * Professor cadastrado por escola deve trocar senha no primeiro acesso
   */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  /**
   * Placeholder para ativar pagamento depois (sem mudar arquitetura)
   */
  @Column({ type: 'boolean', default: false })
  trialMode: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  paymentCustomerId: string | null;

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
