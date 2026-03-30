# Network Error Handling Improvements

## Overview

This document describes the improvements made to error handling for network timeouts and transient errors in the mcp-telegram package.

## Changes

### 1. Custom Error Types (`src/errors.ts`)

Three custom error classes have been added to better categorize and handle different types of errors:

- **`NetworkError`**: For network-related issues (timeouts, connection refused, etc.)
- **`AuthError`**: For authentication/authorization failures
- **`RateLimitError`**: For rate limiting / flood wait errors

Each error class includes static methods to detect if an unknown error belongs to that category:

```typescript
NetworkError.isNetworkError(error)  // Checks for TIMEOUT, ECONNREFUSED, etc.
AuthError.isAuthError(error)        // Checks for AUTH_KEY_UNREGISTERED, SESSION_REVOKED, etc.
RateLimitError.isRateLimitError(error) // Checks for FLOOD_WAIT, Too Many Requests
```

### 2. Automatic Retry with Exponential Backoff

The `retryWithBackoff()` function provides automatic retry logic for transient errors:

```typescript
await retryWithBackoff(async () => {
  // Your API call here
}, {
  maxAttempts: 3,           // Max retry attempts
  initialDelayMs: 1000,     // Initial delay before first retry
  maxDelayMs: 10000,        // Maximum delay between retries
  backoffMultiplier: 2      // Delay multiplier (exponential backoff)
});
```

**Behavior:**
- Automatically retries on network errors and rate limit errors
- Does NOT retry on auth errors (requires user intervention)
- Does NOT retry on unknown/business logic errors
- Uses exponential backoff: 1s → 2s → 4s → ...
- For `FLOOD_WAIT_X` errors, respects the wait time specified by Telegram

### 3. TelegramService Integration

The `TelegramService` class now includes:

- **`withRetry<T>(fn)`**: Private helper method that wraps any API call with automatic retry logic
- Applied to critical methods:
  - `connect()` - Connection initialization with retry
  - `getMe()` - User info retrieval
  - `sendMessage()` - Message sending
  - `downloadMedia()` - Media downloads
  - `getDialogs()` - Dialog list fetching

Example:
```typescript
async sendMessage(...) {
  return this.withRetry(async () => {
    // API calls that may fail due to network issues
  });
}
```

### 4. Enhanced Error Messages (`src/tools/shared.ts`)

The `fail()` helper now provides user-friendly error messages based on error type:

- **Network errors**: "Network error: [details]. This may be a temporary issue - please try again."
- **Auth errors**: "Authentication error: [details]. Run telegram-login to re-authenticate."
- **Rate limit errors**: "Rate limit: [details]. Please wait before retrying."
- **Other errors**: "Error: [details]"

## Benefits

1. **Improved reliability**: Automatic retries reduce failures from temporary network issues
2. **Better UX**: Clear, actionable error messages help users understand what went wrong
3. **Reduced false negatives**: Transient errors are handled gracefully without bothering the user
4. **Respects rate limits**: Properly handles Telegram's flood wait mechanism

## Testing

All error handling logic is covered by unit tests in `src/__tests__/errors.test.ts`:

- Error type detection tests
- Retry logic tests
- Backoff timing tests
- Auth error non-retry tests

Run tests with:
```bash
npm test
```

## Migration Notes

**For end users**: No changes required - error handling is improved transparently.

**For developers**: 
- Import error types from `src/errors.js` if you need custom handling
- Use `withRetry()` pattern for new API methods
- Update error messages in tools to use the enhanced `fail()` helper

## Examples

### Before
```typescript
try {
  await this.client.sendMessage(chatId, text);
} catch (e) {
  // Generic error, no retry
  throw e;
}
```

### After
```typescript
await this.withRetry(async () => {
  await this.client!.sendMessage(chatId, text);
});
// Automatically retries on network errors
// Throws NetworkError with clear message after max attempts
```
