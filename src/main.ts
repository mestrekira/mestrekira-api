import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'https://www.mestrekira.com.br',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // ✅ validação global (segura)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // ✅ filtro global de erros
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
