/** GraphQL context construction and service wiring. */

import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../auth/index.js';
import type { AppConfig } from '../config.js';
import { AuthService } from '../services/authService.js';
import { TicketService } from '../services/ticketService.js';
import { TicketRepository } from '../repositories/ticketRepository.js';
import { UserRepository, HolidayRepository } from '../repositories/userRepository.js';

export interface Services {
  auth: AuthService;
  tickets: TicketService;
  users: UserRepository;
  holidays: HolidayRepository;
}

export function buildServices(prisma: PrismaClient, config: AppConfig): Services {
  const users = new UserRepository(prisma);
  const holidays = new HolidayRepository(prisma);
  const tickets = new TicketRepository(prisma);
  const auth = new AuthService(users, config.jwtSecret, config.jwtExpiresIn);
  const ticketService = new TicketService(tickets, users, holidays, config);
  return { auth, tickets: ticketService, users, holidays };
}

export interface GraphQLContext {
  currentUser: AuthUser | null;
  prisma: PrismaClient;
  services: Services;
  config: AppConfig;
}
