import { AppError } from './AppError.js';
const STATUS_MAP = {
    NOT_FOUND: 404,
    CONFLICT: 409,
    FORBIDDEN: 403,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    TOO_MANY_REQUESTS: 429,
    UNPROCESSABLE: 422,
};
export function replyError(reply, err) {
    if (err instanceof AppError) {
        const status = err.code ? (STATUS_MAP[err.code] ?? err.statusCode) : err.statusCode;
        return reply.code(status).send({ message: err.message });
    }
    throw err;
}
