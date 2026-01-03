import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class EssayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @Column()
  userId: string;

  @Column('text')
  content: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  feedback: string;

  @Column({ type: 'int', nullable: true })
  score: number;

  @CreateDateColumn()
  createdAt: Date;
}
