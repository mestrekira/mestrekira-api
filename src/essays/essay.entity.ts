import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class EssayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @Column()
  studentId: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  feedback: string;

  // ✅ Mantém o score como TOTAL (0..1000) para compatibilidade
  @Column({ type: 'int', nullable: true })
  score: number;

  // ✅ ENEM: 5 competências (0..200 cada)
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
}
