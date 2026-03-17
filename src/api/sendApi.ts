/**
 * 对外 HTTP：供其它程序触发「主动发消息」。
 * 与 WeComBotClient 长连接同进程、同单例，发送前需 WS 已认证。
 *
 * 认证方式：
 * - Header X-App-Id: 传入 appId
 * - Header Authorization: Bearer {secret}
 *
 * 环境变量 INTERNAL_API_TOKENS (JSON数组):
 * [{"appId": "node1", "secret": "secret-xxx"}, {"appId": "node2", "secret": "secret-yyy"}]
 */
import http from 'node:http';
import type { WeComBotClient } from '../client/WeComBotClient.js';
import type { InternalApiConfig, InternalApiToken } from '../types';

function json(res: http.ServerResponse, code: number, body: object): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 验证请求认证
 * @returns appId 如果验证通过，否则返回 null
 */
function authenticate(
  req: http.IncomingMessage,
  tokens: InternalApiToken[]
): string | null {
  const appId = req.headers['x-app-id'] as string | undefined;
  const auth = req.headers.authorization ?? '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!appId || !secret) {
    return null;
  }

  // 查找匹配的 token
  const token = tokens.find((t) => t.appId === appId && t.secret === secret);
  return token ? appId : null;
}

export function startSendApi(
  client: WeComBotClient,
  config: InternalApiConfig
): http.Server {
  const { port, tokens } = config;

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0] ?? '';

    // 健康检查不需要认证
    if (req.method === 'GET' && url === '/api/send/health') {
      return json(res, 200, {
        ok: true,
        wsAuthenticated: client.isConnected(),
      });
    }

    // 认证检查
    const appId = authenticate(req, tokens);
    if (!appId) {
      return json(res, 401, {
        error: 'unauthorized',
        hint: 'Header X-App-Id and Authorization: Bearer <secret> required',
      });
    }

    // WS 连接检查
    if (!client.isConnected()) {
      return json(res, 503, { error: 'websocket_not_ready', hint: 'wait for authenticated' });
    }

    try {
      // POST /api/send/user - 发送消息给用户
      if (req.method === 'POST' && url === '/api/send/user') {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}') as {
          userId?: string;
          content?: string;
          msgType?: 'text' | 'markdown';
        };
        if (!body.userId?.trim() || !body.content?.trim()) {
          return json(res, 400, { error: 'userId and content required' });
        }
        await client.sendMsg(body.userId.trim(), body.content, body.msgType ?? 'text');
        return json(res, 200, { ok: true, appId });
      }

      // POST /api/send/group - 发送群消息
      if (req.method === 'POST' && url === '/api/send/group') {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}') as { chatId?: string; content?: string };
        if (!body.chatId?.trim() || !body.content?.trim()) {
          return json(res, 400, { error: 'chatId and content required' });
        }
        await client.sendGroupMsg(body.chatId.trim(), body.content);
        return json(res, 200, { ok: true, appId });
      }

      return json(res, 404, { error: 'not_found' });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(JSON.stringify(e));
      console.error('[send-api] error:', err);
      return json(res, 500, { error: 'send_failed', message: err.message });
    }
  });

  server.listen(port, () => {
    console.info(`[send-api] listening http://127.0.0.1:${port} (tokens: ${tokens.length})`);
    console.info(`[send-api] POST /api/send/user, /api/send/group`);
  });

  return server;
}
