import { WSClient, generateReqId, type WsFrame, type TemplateCard, type ReplyFeedback } from '@wecom/aibot-node-sdk';
import type { 
  WeComBotConfig, 
  ConnectionState, 
  MessageHandler, 
  EventHandler,
  MessageHandlerData,
  EventHandlerData,
  MessageType,
  EventType,
} from '../types';
import { loadConfig, validateConfig } from './config';
import { getLogger, initLogger } from './logger';

export class WeComBotClient {
  private config: WeComBotConfig;
  private wsClient: WSClient | null = null;
  private state: ConnectionState = 'disconnected';
  private messageHandlers: Map<MessageType, MessageHandler> = new Map();
  private eventHandlers: Map<EventType, EventHandler> = new Map();
  private connectionHandlers: Map<string, Function> = new Map();
  private logger = getLogger();

  constructor(config?: Partial<WeComBotConfig>) {
    this.config = config ? { ...loadConfig(), ...config } : loadConfig();
    validateConfig(this.config);
    initLogger({ logLevel: this.config.logLevel });
    this.logger = getLogger();
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'authenticated') {
      this.logger.warn('Already connected');
      return;
    }

    this.setState('connecting');
    this.logger.info('Connecting to WeCom WebSocket...');

    this.wsClient = new WSClient({
      botId: this.config.botId,
      secret: this.config.secret,
      wsUrl: this.config.wsUrl,
      heartbeatInterval: this.config.heartbeatInterval,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectInterval: this.config.reconnectBaseDelay,
      reconnectMaxDelay: this.config.reconnectMaxDelay,
    } as any);

    this.setupEventListeners();
    this.wsClient.connect();
  }

  private setupEventListeners(): void {
    if (!this.wsClient) return;

    this.wsClient.on('connected', () => {
      this.logger.info('WebSocket connection opened');
    });

    this.wsClient.on('authenticated', () => {
      this.logger.info('Authentication successful');
      this.setState('authenticated');
      this.triggerConnectionHandler('authenticated');
    });

    this.wsClient.on('disconnected', (reason: string) => {
      this.logger.info(`WebSocket connection closed: ${reason}`);
      this.setState('disconnected');
      this.triggerConnectionHandler('disconnected');
    });

    this.wsClient.on('error', (error: Error) => {
      this.logger.error('WebSocket error:', error);
      this.triggerConnectionHandler('error', error);
    });

    this.wsClient.on('reconnecting', (attempt: number) => {
      this.logger.info(`Reconnecting... attempt ${attempt}`);
      this.setState('reconnecting');
      this.triggerConnectionHandler('reconnecting', attempt);
    });

    this.setupMessageHandlers();
    this.setupEventHandlers();
  }

  private setupMessageHandlers(): void {
    if (!this.wsClient) return;

    // 与智能机器人「接收消息」一致：text / image / mixed / voice / file / video / stream
    const messageTypes: MessageType[] = [
      'text',
      'image',
      'voice',
      'file',
      'mixed',
      'video',
      'stream',
      'location',
    ];
    
    for (const msgType of messageTypes) {
      this.wsClient.on(`message.${msgType}` as any, (frame: WsFrame) => {
        const handler = this.messageHandlers.get(msgType);
        if (handler) {
          const data = this.parseMessageData(frame, msgType);
          void Promise.resolve(handler(data, frame)).catch((err) => {
            this.logger.error(`onMessage(${msgType}) error:`, err);
          });
        }
      });
    }
  }

  private setupEventHandlers(): void {
    if (!this.wsClient) return;

    this.wsClient.on('event.enter_chat', (frame: WsFrame) => {
      const handler = this.eventHandlers.get('enter_chat');
      if (handler) {
        const data = this.parseEventData(frame, 'enter_chat');
        handler(data);
      }
    });

    this.wsClient.on('event.template_card_event', (frame: WsFrame) => {
      const handler = this.eventHandlers.get('template_card_event');
      if (handler) {
        const data = this.parseEventData(frame, 'template_card_event');
        handler(data);
      }
    });

    this.wsClient.on('event.feedback_event', (frame: WsFrame) => {
      const handler = this.eventHandlers.get('feedback_event');
      if (handler) {
        const data = this.parseEventData(frame, 'feedback_event');
        handler(data);
      }
    });

    this.wsClient.on('event.disconnected_event' as any, (frame: WsFrame) => {
      this.logger.info('Received disconnected_event: connection kicked by new connection');
      const handler = this.eventHandlers.get('disconnected_event');
      if (handler) {
        const data = this.parseEventData(frame, 'disconnected_event');
        handler(data);
      }
      const body = frame.body as Record<string, unknown>;
      const reason = (body.event as Record<string, unknown>)?.reason as string || 'kicked_by_new_connection';
      this.setState('disconnected');
      this.triggerConnectionHandler('disconnected', reason);
    });
  }

  private parseMessageData(frame: WsFrame, msgType: MessageType): MessageHandlerData {
    const body = frame.body as Record<string, unknown>;
    const from = body.from as Record<string, unknown> | undefined;
    return {
      msgType,
      content: JSON.stringify(body),
      userId: from?.userid as string | undefined,
      fromUserName: from?.name as string | undefined,
      chatId: body.chatid as string | undefined,
      msgId: body.msgid as string | undefined,
      createTime: body.create_time as number | undefined,
    };
  }

  private parseEventData(frame: WsFrame, eventType: EventType): EventHandlerData {
    const body = frame.body as Record<string, unknown>;
    return {
      eventType,
      userId: (body.from as Record<string, unknown>)?.userid as string | undefined,
      chatId: body.chatid as string | undefined,
      eventData: body as Record<string, unknown>,
    };
  }

  on(event: 'connected' | 'authenticated' | 'disconnected' | 'error' | 'reconnecting', handler: Function): void {
    this.connectionHandlers.set(event, handler);
  }

  private triggerConnectionHandler(event: string, ...args: unknown[]): void {
    const handler = this.connectionHandlers.get(event);
    if (handler) {
      handler(...args);
    }
  }

  onMessage(msgType: MessageType, handler: MessageHandler): void {
    this.messageHandlers.set(msgType, handler);
  }

  onEvent(eventType: EventType, handler: EventHandler): void {
    this.eventHandlers.set(eventType, handler);
  }

  /**
   * Send a text reply to a message
   */
  async replyText(frame: WsFrame, content: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    const streamId = generateReqId('stream');
    await this.wsClient.replyStream(frame, streamId, content, true);
  }

  /**
   * Send a markdown reply to a message
   */
  async replyMarkdown(frame: WsFrame, content: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    const streamId = generateReqId('stream');
    await this.wsClient.replyStream(frame, streamId, content, true);
  }

  /**
   * Send a streaming reply to a message
   */
  async replyStream(frame: WsFrame, streamId: string, content: string, finish: boolean): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    await this.wsClient.replyStream(frame, streamId, content, finish);
  }

  /**
   * Send a welcome message when user enters chat
   */
  async replyWelcome(frame: WsFrame, content: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    await this.wsClient.replyWelcome(frame, {
      msgtype: 'text',
      text: { content },
    });
  }

  /**
   * Reply with a template card message
   */
  async replyTemplateCard(frame: WsFrame, templateCard: TemplateCard, feedback?: ReplyFeedback): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    await this.wsClient.replyTemplateCard(frame, templateCard, feedback);
  }

  /**
   * Send a streaming message combined with template card
   */
  async replyStreamWithCard(
    frame: WsFrame, 
    streamId: string, 
    content: string, 
    finish: boolean,
    options?: {
      msgItem?: any[];
      streamFeedback?: ReplyFeedback;
      templateCard?: TemplateCard;
      cardFeedback?: ReplyFeedback;
    }
  ): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    await this.wsClient.replyStreamWithCard(frame, streamId, content, finish, options);
  }

  /**
   * Update an existing template card message
   */
  async updateTemplateCard(frame: WsFrame, templateCard: TemplateCard, userIds?: string[]): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    await this.wsClient.updateTemplateCard(frame, templateCard, userIds);
  }

  /**
   * Send a message to a user (proactive push)
   */
  async sendMsg(userId: string, content: string, msgType: 'markdown' | 'text' = 'text'): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }

    // SDK only supports markdown/template_card/media, convert text to markdown
    const actualMsgType = msgType === 'text' ? 'markdown' : msgType;

    const body = {
      chatid: userId,
      to_userid: userId,
      chat_type: 1,
      msgtype: actualMsgType,
      ...(actualMsgType === 'markdown'
        ? { markdown: { content } }
        : {})
    };

    await this.wsClient.sendMessage(userId, body as any);
  }

  async sendGroupMsg(groupId: string, content: string): Promise<void> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    
    const body = {
      chatid: groupId,
      chat_type: 2,
      msgtype: 'markdown',
      markdown: { content },
    };
    
    await this.wsClient.sendMessage(groupId, body as any);
  }

  /**
   * Download and decrypt a file (image/voice/file)
   */
  async downloadFile(url: string, aesKey: string): Promise<{ buffer: Buffer; filename?: string }> {
    if (!this.wsClient) {
      throw new Error('Client not connected');
    }
    return await this.wsClient.downloadFile(url, aesKey);
  }

  disconnect(): void {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.setState('disconnected');
    this.logger.info('Disconnected');
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'authenticated' || this.state === 'connected';
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.logger.debug(`State changed to: ${state}`);
  }
}
