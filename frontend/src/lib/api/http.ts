import { NextResponse } from 'next/server';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function ok(data: unknown, message?: string, meta?: unknown) {
  return NextResponse.json({ success: true, message, data, meta }, { status: 200 });
}

export function created(data: unknown, message?: string) {
  return NextResponse.json({ success: true, message, data }, { status: 201 });
}

export function fail(status: number, message: string, errors?: unknown) {
  return NextResponse.json({ success: false, message, errors }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) return fail(error.status, error.message, error.details);
  return fail(500, 'Erro interno do servidor.');
}
