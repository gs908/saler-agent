import type { WeComBotConfig, InternalApiConfig, InternalApiToken } from '../types';

const DEFAULT_WS_URL = 'wss://openws.work.weixin.qq.com';
const DEFAULT_HEARTBEAT_INTERVAL = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_BASE_DELAY = 1000;
const DEFAULT_RECONNECT_MAX_DELAY = 30000;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_API_PORT = 3840;

export function loadConfig(): WeComBotConfig {
  const required = ['WECOM_BOT_ID', 'WECOM_BOT_SECRET'];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    botId: process.env.WECOM_BOT_ID!,
    secret: process.env.WECOM_BOT_SECRET!,
    wsUrl: process.env.WECOM_WS_URL || DEFAULT_WS_URL,
    heartbeatInterval: parseInt(process.env.WECOM_HEARTBEAT_INTERVAL || '', 10) || DEFAULT_HEARTBEAT_INTERVAL,
    maxReconnectAttempts: parseInt(process.env.WECOM_MAX_RECONNECT_ATTEMPTS || '', 10) || DEFAULT_MAX_RECONNECT_ATTEMPTS,
    reconnectBaseDelay: parseInt(process.env.WECOM_RECONNECT_BASE_DELAY || '', 10) || DEFAULT_RECONNECT_BASE_DELAY,
    reconnectMaxDelay: parseInt(process.env.WECOM_RECONNECT_MAX_DELAY || '', 10) || DEFAULT_RECONNECT_MAX_DELAY,
    logLevel: (process.env.WECOM_LOG_LEVEL as WeComBotConfig['logLevel']) || DEFAULT_LOG_LEVEL,
  };
}

export function loadInternalApiConfig(): InternalApiConfig | null {
  const tokensStr = process.env.INTERNAL_API_TOKENS;
  if (!tokensStr) {
    return null;
  }

  try {
    const tokens: InternalApiToken[] = JSON.parse(tokensStr);
    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.warn('[config] INTERNAL_API_TOKENS is empty array');
      return null;
    }

    for (const token of tokens) {
      if (!token.appId?.trim() || !token.secret?.trim()) {
        throw new Error('Each token must have non-empty appId and secret');
      }
    }

    const port = parseInt(process.env.API_PORT ?? '', 10) || DEFAULT_API_PORT;

    return { tokens, port };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid INTERNAL_API_TOKENS format: ${msg}. Expected JSON array of {appId, secret}`);
  }
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
