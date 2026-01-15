import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';


@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  async create(name: string, professorId: string) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name,
      professorId,
      code,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    return this.roomRepo.find({
      where: { professorId },
    });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    return this.roomRepo.findOne({
      where: { id },
    });
  }

  // 🔹 BUSCAR SALA PELO CÓDIGO
  async findByCode(code: string) {
    return this.roomRepo.findOne({
      where: { code },
    });
  }
  
  async remove(id: string) {
  await this.roomRepo.delete(id);
  return { ok: true };
}

}


