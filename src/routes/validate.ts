/** Tiny validation helpers — enough to reject malformed bodies cleanly. */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireString(
  body: unknown,
  field: string,
  { maxLength = 5000 }: { maxLength?: number } = {},
): string {
  const obj = (body ?? {}) as Record<string, unknown>;
  const value = obj[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`"${field}" is required and must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`"${field}" must be at most ${maxLength} characters`);
  }
  return value;
}

export function optionalString(
  body: unknown,
  field: string,
  { maxLength = 5000 }: { maxLength?: number } = {},
): string | undefined {
  const obj = (body ?? {}) as Record<string, unknown>;
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`"${field}" must be a string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`"${field}" must be at most ${maxLength} characters`);
  }
  return value;
}

export function optionalBoolean(body: unknown, field: string): boolean | undefined {
  const obj = (body ?? {}) as Record<string, unknown>;
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new ValidationError(`"${field}" must be a boolean`);
  }
  return value;
}
