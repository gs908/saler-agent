/**
 * WeCom Bot Configuration Types
 */

export interface WeComBotConfig {
  /** Bot ID from WeCom admin console */
  botId: string;
  /** Secret from WeCom admin console */
  secret: string;
  /** WebSocket server URL */
  wsUrl?: string;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Max reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnect base delay in milliseconds */
  reconnectBaseDelay?: number;
  /** Reconnect max delay in milliseconds */
  reconnectMaxDelay?: number;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface BotCredentials {
  botId: string;
  secret: string;
}

/**
 * Connection States
 */
export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'authenticated' 
  | 'reconnecting';

/**
 * Message Types
 */
/** 与文档「接收消息」msgtype 对齐：https://developer.work.weixin.qq.com/document/path/100719 */
export type MessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'file'
  | 'mixed'
  | 'video'
  | 'stream'
  | 'location'
  | 'markdown';

/**
 * Event Types
 */
export type EventType = 
  | 'enter_chat' 
  | 'template_card_event' 
  | 'feedback_event'
  | 'disconnected_event';

/**
 * Handler Types
 * 第二个参数为 SDK 原始帧，回复消息时必须传入（replyText / replyStream 等）
 */
export interface MessageHandler {
  (data: MessageHandlerData, frame: import('@wecom/aibot-node-sdk').WsFrame): Promise<void> | void;
}

export interface EventHandler {
  (data: EventHandlerData): Promise<void> | void;
}

export interface MessageHandlerData {
  msgType: MessageType;
  content: string;
  fromUserName?: string;
  userId?: string;
  chatId?: string;
  msgId?: string;
  createTime?: number;
}

export interface EventHandlerData {
  eventType: EventType;
  userId?: string;
  chatId?: string;
  eventData?: Record<string, unknown>;
}

/**
 * Streaming Reply Options
 */
export interface StreamReplyOptions {
  /** Message to send */
  content: string;
  /** Whether this is the final message */
  finish: boolean;
  /** Content type */
  msgType?: 'markdown' | 'text';
}

/**
 * Active Push Options
 */
export interface PushOptions {
  /** User ID to push to */
  userId?: string;
  /** Group ID to push to */
  groupId?: string;
  /** Message content */
  content: string;
  /** Message type */
  msgType?: 'markdown' | 'text';
}

/**
 * Internal API Token (for trusted service authentication)
 */
export interface InternalApiToken {
  /** App ID - passed via X-App-Id header */
  appId: string;
  /** Secret - passed via Authorization header */
  secret: string;
}

/**
 * Internal API Configuration
 */
export interface InternalApiConfig {
  /** List of allowed tokens */
  tokens: InternalApiToken[];
  /** Server port */
  port: number;
}
