// Errors that carry an HTTP status and a "where" hint so problems are easy to locate.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const bad = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Please log in first.') => new ApiError(401, msg);
export const forbidden = (msg = 'You are not allowed to do that.') => new ApiError(403, msg);
export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found.`);

// Wrap async route handlers so thrown errors reach the error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
