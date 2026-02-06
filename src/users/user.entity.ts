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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
