import { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BAD_USER_INPUT',
};

export function formatGraphqlError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  if (original instanceof HttpException) {
    const code = STATUS_TO_CODE[original.getStatus()] ?? 'INTERNAL_SERVER_ERROR';
    return {
      ...formatted,
      message: original.message,
      extensions: { ...formatted.extensions, code },
    };
  }
  return formatted;
}
