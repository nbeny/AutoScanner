export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, key: string | Record<string, unknown>) {
    super(
      `${entity} not found: ${typeof key === 'string' ? key : JSON.stringify(key)}`,
      'NOT_FOUND',
    );
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid credentials', 'INVALID_CREDENTIALS');
  }
}

export class SessionExpiredError extends DomainError {
  constructor() {
    super('Session expired', 'SESSION_EXPIRED');
  }
}

export class SessionRevokedError extends DomainError {
  constructor() {
    super('Session revoked', 'SESSION_REVOKED');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message, 'VALIDATION');
  }
}
