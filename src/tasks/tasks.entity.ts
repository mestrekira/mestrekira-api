import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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
}
