import type { WeComBotConfig } from '../types';

const DEFAULT_WS_URL = 'wss://openws.work.weixin.qq.com';
const DEFAULT_HEARTBEAT_INTERVAL = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 30000;
const DEFAULT_LOG_LEVEL = 'info';

export function loadConfig(): WeComBotConfig {
  const required = ['SALER_AGENT_BOTID', 'SALER_AGENT_SECRET'];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    botId: process.env.SALER_AGENT_BOTID!,
    secret: process.env.SALER_AGENT_SECRET!,
    wsUrl: process.env.WECOM_WS_URL || DEFAULT_WS_URL,
    heartbeatInterval: parseInt(process.env.WECOM_HEARTBEAT_INTERVAL || '', 10) || DEFAULT_HEARTBEAT_INTERVAL,
    maxReconnectAttempts: parseInt(process.env.WECOM_MAX_RECONNECT_ATTEMPTS || '', 10) || DEFAULT_MAX_RECONNECT_ATTEMPTS,
    reconnectBaseDelay: parseInt(process.env.WECOM_RECONNECT_BASE_DELAY || '', 10) || DEFAULT_RECONNECT_BASE_DELAY,
    reconnectMaxDelay: parseInt(process.env.WECOM_RECONNECT_MAX_DELAY || '', 10) || DEFAULT_RECONNECT_MAX_DELAY,
    logLevel: (process.env.WECOM_LOG_LEVEL as WeComBotConfig['logLevel']) || DEFAULT_LOG_LEVEL,
  };
}

export function validateConfig(config: Partial<WeComBotConfig>): config is WeComBotConfig {
  if (!config.botId || config.botId.trim() === '') {
    throw new Error('botId is required');
  }
  if (!config.secret || config.secret.trim() === '') {
    throw new Error('secret is required');
  }
  return true;
}
