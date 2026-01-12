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

  @Column({ type: 'int', nullable: true })
  score: number;
}
