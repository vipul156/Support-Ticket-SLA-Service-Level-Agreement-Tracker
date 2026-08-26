/**
 * SLA policy + evaluation. Pure module — no I/O.
 *
 * States:
 * - ON_TRACK: 0..75% of budget consumed (inclusive at exactly 75%)
 * - AT_RISK:  >75% consumed
 * - BREACHED: deadline passed (consumed > 100%)
 * - MET:      the SLA event happened; clock frozen (within budget ⇒ MET,
 *             past deadline at event time ⇒ remains MET for the completed
 *             clock — see evaluateSla for the frozen-state semantics)
 */

import { BusinessHoursConfig, HolidaySource } from './businessCalendar.js';
import {
  addBusinessMinutes,
  budgetConsumedRatio,
  businessMinutesBetween,
  businessMinutesRemaining,
} from './businessMinutes.js';

export type SLAState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SLAPolicy {
  firstResponseBusinessMinutes: number;
  resolutionBusinessMinutes: number;
}

/** Default policies from the assignment brief (business hours). */
export const DEFAULT_SLA_POLICIES: Readonly<Record<Priority, SLAPolicy>> = {
  URGENT: { firstResponseBusinessMinutes: 60, resolutionBusinessMinutes: 4 * 60 },
  HIGH: { firstResponseBusinessMinutes: 4 * 60, resolutionBusinessMinutes: 24 * 60 },
  MEDIUM: { firstResponseBusinessMinutes: 8 * 60, resolutionBusinessMinutes: 48 * 60 },
  LOW: { firstResponseBusinessMinutes: 24 * 60, resolutionBusinessMinutes: 72 * 60 },
};

/** AT_RISK threshold: strictly greater than this consumed ratio. */
export const AT_RISK_THRESHOLD = 0.75;

export interface SLAInput {
  createdAt: Date;
  priority: Priority;
  /** Frozen event timestamps, when they exist. */
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  /** Stored due timestamps (computed at creation; see README tradeoff). */
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
}

export interface SLAClockState {
  state: SLAState;
  remainingMinutes: number;
  dueAt: Date;
}

export interface SLAEvaluation {
  firstResponse: SLAClockState;
  resolution: SLAClockState;
}

function clockState(
  createdAt: Date,
  dueAt: Date,
  budgetMinutes: number,
  eventAt: Date | null,
  now: Date,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): SLAClockState {
  // Clock frozen: the event happened; the SLA is complete forever.
  if (eventAt !== null) {
    const metInBudget = eventAt.getTime() <= dueAt.getTime();
    return {
      state: 'MET',
      remainingMinutes: metInBudget ? Math.max(0, businessMinutesRemaining(eventAt, dueAt, config, holidays)) : 0,
      dueAt,
    };
  }
  const ratio = budgetConsumedRatio(createdAt, now, budgetMinutes, config, holidays);
  const remaining = businessMinutesRemaining(now, dueAt, config, holidays);
  if (remaining <= 0) {
    return { state: 'BREACHED', remainingMinutes: 0, dueAt };
  }
  if (ratio > AT_RISK_THRESHOLD) {
    return { state: 'AT_RISK', remainingMinutes: remaining, dueAt };
  }
  return { state: 'ON_TRACK', remainingMinutes: remaining, dueAt };
}

/** Evaluate both SLA clocks for a ticket at instant `now`. */
export function evaluateSla(
  input: SLAInput,
  now: Date,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
  policies: Readonly<Record<Priority, SLAPolicy>> = DEFAULT_SLA_POLICIES,
): SLAEvaluation {
  const policy = policies[input.priority];
  return {
    firstResponse: clockState(
      input.createdAt,
      input.firstResponseDueAt,
      policy.firstResponseBusinessMinutes,
      input.firstResponseAt,
      now,
      config,
      holidays,
    ),
    resolution: clockState(
      input.createdAt,
      input.resolutionDueAt,
      policy.resolutionBusinessMinutes,
      input.resolvedAt,
      now,
      config,
      holidays,
    ),
  };
}

/** Due times for a freshly created ticket (business-time budget from now). */
export function computeDueTimes(
  createdAt: Date,
  priority: Priority,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
  policies: Readonly<Record<Priority, SLAPolicy>> = DEFAULT_SLA_POLICIES,
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const policy = policies[priority];
  return {
    firstResponseDueAt: addBusinessMinutes(createdAt, policy.firstResponseBusinessMinutes, config, holidays),
    resolutionDueAt: addBusinessMinutes(createdAt, policy.resolutionBusinessMinutes, config, holidays),
  };
}

export { businessMinutesBetween };
