import { Body, Controller, Post } from '@nestjs/common';
import { SchoolTeacherService } from './school-teacher.service';

@Controller('school-teacher')
export class SchoolTeacherController {
  constructor(private readonly svc: SchoolTeacherService) {}

  @Post('send-code')
  sendCode(@Body('email') email: string) {
    return this.svc.sendCode(email);
  }

  @Post('verify-code')
  verifyCode(@Body('email') email: string, @Body('code') code: string) {
    return this.svc.verifyCode(email, code);
  }
}