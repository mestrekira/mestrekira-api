import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['taskId', 'studentId'], { unique: true }) // ✅ 1 por tarefa/aluno
export class EssayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  studentId: string;

  @Column('text')
  content: string;

  // ✅ rascunho vs enviada
  @Column({ type: 'boolean', default: true })
  isDraft: boolean;

  @Column({ nullable: true })
  feedback: string;

  // ENEM
  @Column({ type: 'int', nullable: true })
  c1: number;

  @Column({ type: 'int', nullable: true })
  c2: number;

  @Column({ type: 'int', nullable: true })
  c3: number;

  @Column({ type: 'int', nullable: true })
  c4: number;

  @Column({ type: 'int', nullable: true })
  c5: number;

  // total (0..1000)
  @Column({ type: 'int', nullable: true })
  score: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
