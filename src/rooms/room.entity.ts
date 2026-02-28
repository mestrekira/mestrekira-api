import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'room_entity' })
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /**
   * compatível com o sistema atual:
   * salas do professor usam professorId
   */
  @Index()
  @Column({ type: 'uuid' })
  professorId: string;

  @Index({ unique: true })
  @Column({ type: 'text', unique: true })
  code: string;

  // ================================
  // ✅ Perfil Escolar
  // ================================
  @Column({ type: 'text', default: 'PROFESSOR' })
  ownerType: string; // 'PROFESSOR' | 'SCHOOL'

  @Index()
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  /**
   * quando ownerType='SCHOOL', aponta para o professor responsável
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'text', nullable: true })
  teacherNameSnapshot: string | null;

  /**
   * ✅ Ano letivo (filtro do painel escolar)
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  schoolYearId: string | null;

  // ================================
  // ✅ Datas automáticas (para "Criado em: ...")
  // ================================
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
