/**
 * Safely executes a function, catching any errors and preventing them from bubbling up.
 * Optionally logs the error if a logger is provided.
 */
export function safeExecute<T = void>(
  fn: () => T,
  onError?: (error: unknown) => void
): T | undefined {
  try {
    return fn()
  } catch (error) {
    if (onError) {
      try {
        onError(error)
      } catch (e) {
        // Even the error handler failed, nothing more we can do
        console.error('Safe execution error handler failed:', e)
      }
    }
    return undefined
  }
}

/**
 * Safely executes an async function, catching any errors and preventing them from bubbling up.
 */
export async function safeExecuteAsync<T = void>(
  fn: () => Promise<T>,
  onError?: (error: unknown) => void
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    if (onError) {
      try {
        onError(error)
      } catch (e) {
        console.error('Safe execution async error handler failed:', e)
      }
    }
    return undefined
  }
}
