class AppError extends Error {
    constructor(statusCode, message, errorCode = undefined){
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        // Optional machine-readable code (e.g. "TAG_NOT_FOUND").
        // Only set when explicitly passed, so existing callers are unaffected.
        this.errorCode = errorCode;

        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;