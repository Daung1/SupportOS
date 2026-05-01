import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(role?: string): Promise<User[]> {
    const where: Prisma.UserWhereInput = {};
    if (role !== undefined && role !== '') {
      where.role = role;
    }

    return this.prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
