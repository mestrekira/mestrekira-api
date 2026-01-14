import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EssaysController } from './essays.controller';
import { EssaysService } from './essays.service';
import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EssayEntity,
      UserEntity, // 🔥 ESSENCIAL
    ]),
  ],
  controllers: [EssaysController],
  providers: [EssaysService],
})
export class EssaysModule {}
