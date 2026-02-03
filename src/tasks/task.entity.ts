import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { CreateDateColumn, UpdateDateColumn, Column } from 'typeorm';
@Entity()
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  guidelines: string;

  @CreateDateColumn({ type: 'timestamp', name: 'createdAt' })
createdAt: Date;

@UpdateDateColumn({ type: 'timestamp', name: 'updatedAt' })
updatedAt: Date;
}

