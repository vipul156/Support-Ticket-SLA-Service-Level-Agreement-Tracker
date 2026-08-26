/** Shared resolver helpers: timestamps, SLA mapping, ID coercion. */

import type { TicketWithRelations } from '../../repositories/ticketRepository.js';
import { evaluateSla, SLAState } from '../../services/sla/slaEngine.js';
import type { HolidaySource } from '../../services/sla/businessCalendar.js';
import type { BusinessHoursConfig } from '../../services/sla/businessCalendar.js';
import type { SLAPolicy, Priority } from '../../services/sla/slaEngine.js';

export interface SlaDeps {
  businessHours: BusinessHoursConfig;
  holidaySource: HolidaySource;
  slaPolicies: Readonly<Record<Priority, SLAPolicy>>;
}

export function iso(date: Date | null | undefined): string | null {
  return date === null || date === undefined ? null : date.toISOString();
}

export function isoRequired(date: Date): string {
  return date.toISOString();
}

export interface SLAInfoDto {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export function slaInfoFor(ticket: TicketWithRelations, now: Date, deps: SlaDeps): SLAInfoDto {
  const evaluation = evaluateSla(
    {
      createdAt: ticket.createdAt,
      priority: ticket.priority,
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolutionDueAt: ticket.resolutionDueAt,
    },
    now,
    deps.businessHours,
    deps.holidaySource,
    deps.slaPolicies,
  );
  return {
    firstResponseDueAt: evaluation.firstResponse.dueAt.toISOString(),
    resolutionDueAt: evaluation.resolution.dueAt.toISOString(),
    firstResponseState: evaluation.firstResponse.state,
    resolutionState: evaluation.resolution.state,
    firstResponseRemainingMinutes: evaluation.firstResponse.remainingMinutes,
    resolutionRemainingMinutes: evaluation.resolution.remainingMinutes,
  };
}

export function parseId(value: string | number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ID: ${String(value)}`);
  }
  return n;
}
