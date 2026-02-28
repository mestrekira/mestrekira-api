import { Entity, PrimaryGeneratedColumn, Column,  CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * compatível com o sistema atual:
   * salas do professor usam professorId
   */
  @Column()
  professorId: string;

  @Column({ unique: true })
  code: string;

  // ================================
  // ✅ Novos campos para Perfil Escolar
  // ================================
  @Column({ type: 'text', default: 'PROFESSOR' })
  ownerType: string; // 'PROFESSOR' | 'SCHOOL'

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  /**
   * quando ownerType='SCHOOL', aponta para o professor responsável
   */
  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'text', nullable: true })
  teacherNameSnapshot: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
createdAt: Date;

@UpdateDateColumn({ type: 'timestamptz' })
updatedAt: Date;
}
