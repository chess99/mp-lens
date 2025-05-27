/**
 * 判断是否启用遥测（默认启用，除非 ANONYMIZED_TELEMETRY=false）
 */
export function isTelemetryEnabled(): boolean {
  const env = process.env.ANONYMIZED_TELEMETRY;
  if (typeof env === 'string' && env.toLowerCase() === 'false') {
    return false;
  }
  return true;
}
