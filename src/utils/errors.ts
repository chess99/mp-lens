/**
 * Represents an error that is handled by the application and typically communicated to the user,
 * rather than being an unexpected program bug. These errors are not sent to telemetry.
 */
export class HandledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandledError';
    // Ensure the prototype chain is correctly set up for instanceof checks
    Object.setPrototypeOf(this, HandledError.prototype);
  }
}
