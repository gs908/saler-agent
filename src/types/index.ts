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
export type MessageType = 'text' | 'image' | 'voice' | 'file' | 'mixed' | 'markdown';

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
 */
export interface MessageHandler {
  (data: MessageHandlerData): Promise<void> | void;
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
