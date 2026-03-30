/**
 * Custom error types for better error handling and retry logic
 */

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramError";
  }
}

export class NetworkError extends TelegramError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "NetworkError";
  }

  static isNetworkError(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    const msg = (error as { errorMessage?: string; message?: string }).errorMessage || 
                (error as { errorMessage?: string; message?: string }).message || "";
    return (
      msg.includes("TIMEOUT") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENETUNREACH") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("EHOSTUNREACH") ||
      msg.includes("network") ||
      msg.includes("Connection") ||
      msg.includes("timed out")
    );
  }
}

export class AuthError extends TelegramError {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }

  static isAuthError(error: unknown): boolean {
    const msg = (error as { errorMessage?: string; message?: string }).errorMessage || 
                (error as { errorMessage?: string; message?: string }).message || "";
    return (
      msg === "AUTH_KEY_UNREGISTERED" ||
      msg === "SESSION_REVOKED" ||
      msg === "USER_DEACTIVATED" ||
      msg.includes("AUTH_KEY") ||
      msg.includes("SESSION_")
    );
  }
}

export class RateLimitError extends TelegramError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = "RateLimitError";
  }

  static isRateLimitError(error: unknown): boolean {
    const msg = (error as { errorMessage?: string; message?: string }).errorMessage || 
                (error as { errorMessage?: string; message?: string }).message || "";
    return msg.includes("FLOOD_WAIT") || msg.includes("Too Many Requests");
  }
}

/**
 * Retry configuration for transient errors
 */
export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Retry a function with exponential backoff for transient network errors
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry auth errors or non-network errors
      if (AuthError.isAuthError(error)) {
        throw error;
      }
      
      if (!NetworkError.isNetworkError(error) && !RateLimitError.isRateLimitError(error)) {
        throw error;
      }
      
      // Last attempt - throw the error
      if (attempt === opts.maxAttempts) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      
      // For rate limit errors, use the provided retry_after if available
      if (RateLimitError.isRateLimitError(error)) {
        const floodWaitMatch = String(lastError).match(/FLOOD_WAIT_(\\d+)/);
        if (floodWaitMatch) {
          const waitSeconds = Number.parseInt(floodWaitMatch[1], 10);
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          continue;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Wrap the last error in a NetworkError if it was a network issue
  if (NetworkError.isNetworkError(lastError)) {
    throw new NetworkError(
      `Network operation failed after ${opts.maxAttempts} attempts: ${(lastError as Error).message}`,
      lastError
    );
  }
  
  throw lastError;
}
