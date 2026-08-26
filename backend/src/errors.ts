/** Machine-readable application errors surfaced as GraphQL error extensions. */

import { GraphQLError } from 'graphql';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_PRIORITY'
  | 'INVALID_COMMENT'
  | 'TICKET_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_STATUS_TRANSITION'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'BAD_USER_INPUT'
  | 'INTERNAL_SERVER_ERROR';

/**
 * Extends GraphQLError so Yoga surfaces the message and machine-readable
 * `extensions.code` instead of masking the error as "Unexpected error".
 */
export class AppError extends GraphQLError {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, httpStatus = 400) {
    super(message, { extensions: { code } });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
