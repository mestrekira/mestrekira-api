import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SchoolsService } from './schools.service';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';

@Controller('schools')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('school')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Post('rooms')
  async createRoom(
    @Req() req: any,
    @Body()
    body: { roomName: string; teacherName: string; teacherEmail: string },
  ) {
    const schoolId = String(req?.user?.id || '').trim();
    if (!schoolId) throw new BadRequestException('Sessão inválida.');

    return this.schools.createRoomAsSchool(schoolId, body);
  }

  @Get('rooms')
  async listRooms(@Req() req: any) {
    const schoolId = String(req?.user?.id || '').trim();
    if (!schoolId) throw new BadRequestException('Sessão inválida.');

    return this.schools.listRoomsBySchool(schoolId);
  }
}
