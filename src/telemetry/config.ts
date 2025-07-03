/**
 * 判断是否启用遥测
 * 默认启用，除非
 * 1. 环境变量 `MP_LENS_TELEMETRY_DISABLED` 设置为 `true`
 * 2. 环境变量 `ANONYMIZED_TELEMETRY` 设置为 `false`
 * 3. 函数入参 `enabled` 为 `false`
 * @param enabled 来自命令行或配置的开关
 */
export function isTelemetryEnabled(enabled?: boolean): boolean {
  if (enabled === false) {
    return false;
  }
  const disabledByEnv = process.env.MP_LENS_TELEMETRY_DISABLED;
  if (typeof disabledByEnv === 'string' && disabledByEnv.toLowerCase() === 'true') {
    return false;
  }
  const env = process.env.ANONYMIZED_TELEMETRY;
  if (typeof env === 'string' && env.toLowerCase() === 'false') {
    return false;
  }
  return true;
}
