import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'room_entity' })
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /**
   * Mantido por compatibilidade:
   * - Sala do professor: professorId = dono (professor individual)
   * - Sala da escola: professorId = professor responsável (gerenciado)
   */
  @Column({ type: 'uuid' })
  professorId: string;

  @Column({ type: 'text', unique: true })
  code: string;

  /**
   * Novo: quem é o "dono administrativo" da sala
   * - 'PROFESSOR' (criada por professor)
   * - 'SCHOOL' (criada pela escola)
   */
  @Column({ type: 'text', default: 'PROFESSOR' })
  ownerType: string; // 'PROFESSOR' | 'SCHOOL'

  /**
   * Novo: quando ownerType='SCHOOL', guarda o id do usuário escola (role='school')
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  /**
   * Opcional: snapshot do nome do professor no momento da criação (útil no painel escola)
   */
  @Column({ type: 'text', nullable: true })
  teacherNameSnapshot: string | null;
}
