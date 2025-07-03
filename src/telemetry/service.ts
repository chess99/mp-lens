import { isTelemetryEnabled } from './config';
import { TelemetryEvent } from './events';
import { sendToPostHog } from './posthog';
import { getOrCreateUserId } from './user';

class TelemetryService {
  private enabled: boolean = true; // Default to true, will be properly set in init
  private userId: string = '';
  private initialized: boolean = false;

  init(options: { telemetry?: boolean }) {
    this.enabled = isTelemetryEnabled(options.telemetry);
    if (this.enabled) {
      this.userId = getOrCreateUserId();
    }
    this.initialized = true;
  }

  capture(event: Omit<TelemetryEvent, 'userId' | 'timestamp'>) {
    if (!this.enabled) return;

    // Prepare the properties for PostHog.
    // This should include specific fields from CommandEvent or ErrorEvent,
    // and the original event.properties, but NOT event name, userId, or timestamp.
    const postHogProperties: Record<string, any> = {
      ...(event.properties || {}), // Start with original properties
    };

    // Add type-specific properties from the event, excluding 'event' and 'properties' keys
    // as 'event' is the event name (top-level for PostHog)
    // and 'properties' is already spread.
    for (const key in event) {
      if (key !== 'event' && key !== 'properties') {
        postHogProperties[key] = (event as any)[key];
      }
    }

    // The PostHog library will add its own timestamp.
    // If we need to record the exact client-side generation time for our own analysis
    // within properties, we can add it here. The debug output indicates a `timestamp`
    // *within* properties, so we will retain that for now, but use the newly generated one.
    postHogProperties.timestamp = Date.now();
    // The userId is passed as distinctId, but the debug output also shows it in properties.
    // We will also retain this for now.
    postHogProperties.userId = this.userId;

    try {
      sendToPostHog({
        event: event.event, // This is the event name like 'command' or 'error'
        distinctId: this.userId,
        properties: postHogProperties,
      });
    } catch (e) {
      // Log the error instead of failing silently
      console.error('Telemetry capture error:', e);
    }
  }
}

export const telemetry = new TelemetryService();
