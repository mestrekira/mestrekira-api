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
   * Roles atuais:
   * - 'student'
   * - 'professor'
   * Novo:
   * - 'school'
   */
  @Column({ type: 'text', default: 'student' })
  role: string;

  // ================================
  // 🔹 Novos campos: Escola / Professor gerenciado / Billing / Limites
  // ================================

  /**
   * Para professores:
   * - 'INDIVIDUAL' (paga futuramente)
   * - 'SCHOOL' (gerenciado por escola, não paga)
   * null para student/school
   */
  @Column({ type: 'text', nullable: true })
  professorType: string | null; // 'INDIVIDUAL' | 'SCHOOL'

  /**
   * Para professor gerenciado por escola:
   * aponta para o ID do usuário escola (role='school')
   */
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  /**
   * Professor cadastrado pela escola deve trocar senha no primeiro acesso
   */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  /**
   * “Mostra grátis” do professor individual (primeiro acesso):
   * quando true, limite por sala fica 25
   */
  @Column({ type: 'boolean', default: false })
  trialMode: boolean;

  /**
   * Base para cobrança futura (Stripe/MercadoPago/etc.)
   */
  @Column({ type: 'text', nullable: true })
  paymentCustomerId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

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
