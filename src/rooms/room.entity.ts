import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'room_entity' }) // <- coloquei nome explícito pra evitar surpresas
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /**
   * Continua existindo e continua sendo o “professor responsável”:
   * - Sala do professor: professorId = dono
   * - Sala da escola: professorId = professor responsável da sala (gerenciado)
   */
  @Column({ type: 'uuid' })
  professorId: string;

  @Column({ type: 'text', unique: true })
  code: string;

  /**
   * Novo: quem “é o dono administrativo” da sala
   * - 'PROFESSOR' (sala criada por professor)
   * - 'SCHOOL'    (sala criada pela escola)
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
   * Opcional: snapshot do nome do professor no momento da criação pela escola
   */
  @Column({ type: 'text', nullable: true })
  teacherNameSnapshot: string | null;
}
