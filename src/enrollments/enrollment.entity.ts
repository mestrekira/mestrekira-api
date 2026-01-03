import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class EnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @Column()
  studentId: string;
}
