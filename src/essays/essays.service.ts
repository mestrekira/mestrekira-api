import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, QueryFailedError } from 'typeorm';
import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
  ) {}

  /**
   * ✅ Extrai o "corpo" da redação quando vier empacotada:
   * "__TITLE__:titulo\n\ncorpo..."
   * Se não estiver empacotada, retorna o texto inteiro.
   */
  private extractBodyFromPackedContent(content: string) {
    const text = String(content ?? '').replace(/\r\n/g, '\n');
    const m = text.match(/^__TITLE__\s*:\s*.*?\n\n([\s\S]*)$/i);
    if (m) return String(m[1] ?? '');
    return text;
  }

  // ✅ detecta violação de unique no Postgres (23505)
  private isUniqueViolation(err: any) {
    return (
      err instanceof QueryFailedError &&
      (err as any)?.driverError?.code === '23505'
    );
  }

  /**
   * ✅ salvar rascunho (upsert)
   * PATCH mínimo: protege contra concorrência/race (dois autosaves ao mesmo tempo)
   * sem mexer no fluxo do sistema.
   */
  async saveDraft(taskId: string, studentId: string, content: string) {
    const text = String(content ?? '');

    // ⚠️ Mantém seu comportamento atual (1 linha por task+student)
    const existing = await this.essayRepo.findOne({
      where: { taskId, studentId },
    });

    // já enviada: não deixa virar rascunho novamente
    if (existing && existing.isDraft === false) {
      throw new ConflictException(
        'Você já enviou esta redação. Não é possível salvar rascunho.',
      );
    }

    // não existe ainda → tenta criar rascunho
    if (!existing) {
      try {
        const essay = this.essayRepo.create({
          taskId,
          studentId,
          content: text,
          isDraft: true,
        });
        return await this.essayRepo.save(essay);
      } catch (err) {
        // se concorrência criou ao mesmo tempo, cai aqui por UNIQUE
        if (!this.isUniqueViolation(err)) throw err;

        // recarrega e segue o fluxo padrão (update)
        const again = await this.essayRepo.findOne({
          where: { taskId, studentId },
        });

        if (again && again.isDraft === false) {
          throw new ConflictException(
            'Você já enviou esta redação. Não é possível salvar rascunho.',
          );
        }
        if (!again) throw err; // caso raríssimo

        await this.essayRepo.update(again.id, {
          content: text,
          isDraft: true,
        });

        return this.essayRepo.findOne({ where: { id: again.id } });
      }
    }

    // existe (rascunho) → atualiza
    await this.essayRepo.update(existing.id, {
      content: text,
      isDraft: true,
    });

    return this.essayRepo.findOne({ where: { id: existing.id } });
  }

  // ✅ enviar redação (bloqueia duplicado)
  async submit(taskId: string, studentId: string, content: string) {
    const text = String(content ?? '');

    // ✅ conta mínimo de 500 pelo corpo (se estiver empacotada), senão pelo texto inteiro
    const body = this.extractBodyFromPackedContent(text);
    if ((body || '').length < 500) {
      throw new BadRequestException(
        'A redação deve ter pelo menos 500 caracteres.',
      );
    }

    const existing = await this.essayRepo.findOne({
      where: { taskId, studentId },
    });

    if (existing && existing.isDraft === false) {
      throw new ConflictException(
        'Você já enviou esta redação para esta tarefa.',
      );
    }

    // se não existe, cria enviada
    if (!existing) {
      const essay = this.essayRepo.create({
        taskId,
        studentId,
        content: text,
        isDraft: false,
      });
      return this.essayRepo.save(essay);
    }

    // existe rascunho -> vira enviada
    await this.essayRepo.update(existing.id, {
      content: text,
      isDraft: false,
    });

    return this.essayRepo.findOne({ where: { id: existing.id } });
  }

  // ✅ buscar (rascunho ou enviada) do aluno na tarefa
  async findByTaskAndStudent(taskId: string, studentId: string) {
    return this.essayRepo.findOne({ where: { taskId, studentId } });
  }

  async correctEnem(
    id: string,
    feedback: string,
    c1: number,
    c2: number,
    c3: number,
    c4: number,
    c5: number,
  ) {
    const score =
      Number(c1) + Number(c2) + Number(c3) + Number(c4) + Number(c5);

    await this.essayRepo.update(id, {
      feedback,
      c1,
      c2,
      c3,
      c4,
      c5,
      score,
      isDraft: false,
    });

    return this.essayRepo.findOne({ where: { id } });
  }

  // ✅ lista por tarefa (professor normalmente quer só ENVIADAS)
  async findByTask(taskId: string) {
    return this.essayRepo.find({
      where: { taskId, isDraft: false },
      // melhor: ordena por data; se por algum motivo não existir, id dá estabilidade
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
  }

  /**
   * ✅ professor: redações + dados do aluno (filtra rascunhos)
   * ✅ IMPORTANTE: retorna createdAt/updatedAt no JSON
   */
  async findByTaskWithStudent(taskId: string) {
    const essays = await this.essayRepo.find({
      where: { taskId, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

    const map = new Map(students.map((s) => [s.id, s]));

    return essays.map((e) => {
      const s = map.get(e.studentId);

      return {
        id: e.id,
        taskId: e.taskId,
        studentId: e.studentId,

        content: e.content,
        feedback: e.feedback ?? null,

        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        score: e.score ?? null,

        isDraft: e.isDraft ?? false,

        // ✅ DATAS
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,

        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
      };
    });
  }

  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }

  async findOneWithStudent(id: string) {
    const essay = await this.essayRepo.findOne({ where: { id } });
    if (!essay) return null;

    const student = await this.userRepo.findOne({
      where: { id: essay.studentId },
    });

    return {
      ...essay,
      studentName: student?.name ?? '(aluno não encontrado)',
      studentEmail: student?.email ?? '',
    };
  }

  // ✅ professor: desempenho por sala (NÃO contar rascunhos)
  async performanceByRoom(roomId: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), isDraft: false },
    });
    if (essays.length === 0) return [];

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);
      const s = studentMap.get(e.studentId);

      return {
        id: e.id,

        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',

        studentId: e.studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',

        isDraft: e.isDraft ?? false,

        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,

        feedback: e.feedback ?? null,
        content: e.content ?? '',

        // ✅ DATAS
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }

  // ✅ aluno: desempenho por sala (só dele) — também sem rascunhos
  // (mantém compatibilidade com o front, mas agora inclui taskTitle)
  async performanceByRoomForStudent(roomId: string, studentId: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), studentId, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);

      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',
        isDraft: e.isDraft ?? false,

        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,

        feedback: e.feedback ?? null,

        // ✅ DATAS
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }

  /**
   * ✅ PDF: pega redações COMPLETAS (inclui content) por sala + aluno
   * - EssayEntity não tem roomId, então filtramos por tasks da sala
   * - sem rascunhos
   * - devolve content já "limpo" (sem __TITLE__)
   */
  async findEssaysWithContentByRoomForStudent(roomId: string, studentId: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), studentId, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);

      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',

        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,

        // ✅ aqui vem o texto
        content: this.extractBodyFromPackedContent(e.content ?? ''),

        // ✅ datas
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }
}
