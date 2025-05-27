import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY =
  process.env.POSTHOG_API_KEY || 'phc_AmH9qDDxzIvq2suq1upLi5tmDF0P6AhRFZKtavIpUof'; // 推荐用环境变量

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

const client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });

// 开启调试模式
// client.debug();

client.on('error', (err) => {
  console.error('PostHog had an error!', err);
});

export function sendToPostHog(event: {
  event: string;
  distinctId: string;
  properties?: Record<string, any>;
}) {
  try {
    client.capture({
      distinctId: event.distinctId,
      event: event.event,
      properties: event.properties || {},
    });
  } catch (e) {
    console.error('PostHog capture error:', e);
  }
}

export async function shutdownTelemetry() {
  await client.shutdown();
}
