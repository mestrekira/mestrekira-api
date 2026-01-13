import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EssayEntity } from './essay.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    private readonly dataSource: DataSource,
  ) {}

  // 🔹 Criar redação (envio do aluno)
  async create(taskId: string, studentId: string, content: string) {
    const essay = this.essayRepo.create({
      taskId,
      studentId,
      content,
    });

    return this.essayRepo.save(essay);
  }

  // 🔹 Corrigir redação (professor)
  async correct(id: string, feedback: string, score: number) {
    await this.essayRepo.update(id, { feedback, score });
    return this.essayRepo.findOne({ where: { id } });
  }

  // 🔹 Listar redações por tarefa (SIMPLES – uso interno)
  async findByTask(taskId: string) {
    return this.essayRepo.find({ where: { taskId } });
  }

  // 🔹 🔥 LISTAR REDAÇÕES COM DADOS DO ALUNO (USO DO PROFESSOR)
  async findByTaskWithStudent(taskId: string) {
    return this.dataSource.query(
      `
      SELECT 
        e.id,
        e.content,
        e.feedback,
        e.score,
        u.name AS studentName,
        u.email AS studentEmail
      FROM essay_entity e
      JOIN user_entity u ON u.id = e.studentId
      WHERE e.taskId = ?
      `,
      [taskId],
    );
  }

  // 🔹 Buscar uma redação específica
  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }
}
