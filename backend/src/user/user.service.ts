import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  list(role?: string): Promise<User[]> {
    return this.userRepository.findAll(role);
  }

  async getById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return user;
  }

  /**
   * Validate a userId without throwing if it's missing/empty. Returns the
   * canonical id string when the user exists, otherwise null. Used by
   * TicketService to silently drop unknown ids before persisting.
   */
  async resolveOptional(id?: string | null): Promise<string | null> {
    if (!id) {
      return null;
    }
    const user = await this.userRepository.findById(id);
    return user ? user.id : null;
  }
}
