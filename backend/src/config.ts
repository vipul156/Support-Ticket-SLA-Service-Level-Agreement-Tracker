/** Central configuration loaded from environment variables. */

import { BusinessHoursConfig, DEFAULT_BUSINESS_HOURS } from './services/sla/businessCalendar.js';
import { DEFAULT_SLA_POLICIES, Priority, SLAPolicy } from './services/sla/slaEngine.js';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  businessHours: BusinessHoursConfig;
  slaPolicies: Readonly<Record<Priority, SLAPolicy>>;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer for ${name}: ${raw}`);
  return n;
}

function envStr(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${name}`);
  }
  return raw;
}

function policyFromEnv(base: SLAPolicy, prefix: string): SLAPolicy {
  return {
    firstResponseBusinessMinutes: envInt(`${prefix}_FIRST_RESPONSE_MINUTES`, base.firstResponseBusinessMinutes),
    resolutionBusinessMinutes: envInt(`${prefix}_RESOLUTION_MINUTES`, base.resolutionBusinessMinutes),
  };
}

export function loadConfig(): AppConfig {
  const slaPolicies: Record<Priority, SLAPolicy> = {
    URGENT: policyFromEnv(DEFAULT_SLA_POLICIES.URGENT, 'SLA_URGENT'),
    HIGH: policyFromEnv(DEFAULT_SLA_POLICIES.HIGH, 'SLA_HIGH'),
    MEDIUM: policyFromEnv(DEFAULT_SLA_POLICIES.MEDIUM, 'SLA_MEDIUM'),
    LOW: policyFromEnv(DEFAULT_SLA_POLICIES.LOW, 'SLA_LOW'),
  };
  return {
    port: envInt('PORT', 3000),
    databaseUrl: envStr('DATABASE_URL'),
    jwtSecret: envStr('JWT_SECRET'),
    jwtExpiresIn: envStr('JWT_EXPIRES_IN', '7d'),
    businessHours: {
      ...DEFAULT_BUSINESS_HOURS,
      timezone: envStr('BUSINESS_TIMEZONE', DEFAULT_BUSINESS_HOURS.timezone),
      startHour: envInt('BUSINESS_START_HOUR', DEFAULT_BUSINESS_HOURS.startHour),
      endHour: envInt('BUSINESS_END_HOUR', DEFAULT_BUSINESS_HOURS.endHour),
    },
    slaPolicies,
  };
}
