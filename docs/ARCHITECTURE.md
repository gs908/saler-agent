# 架构说明：被动收消息 + 对外发送接口

## 现状

- **单进程**：`WeComBotClient` 长连接 WebSocket，只处理企微下发的 `aibot_msg_callback`。
- **被动**：逻辑写在 `onMessage` / `onEvent` 里，**没有**对外的 HTTP/RPC，其它程序无法调用。

## 目标

- 其它服务通过 **HTTP（或以后 gRPC/队列）** 触发：**给指定人 / 指定群发消息**。
- 发送仍依赖 **同一条已认证的 WebSocket**（`sendMessage`），不能单独再起一个「只发不收」的无状态 HTTP 就发到企微（除非走官方别的 HTTP API）。

## 推荐架构（单进程双通道）

```
                    ┌─────────────────────────────────────┐
                    │           Node 进程                │
                    │                                     │
  企微服务器 ──WSS──►│  WeComBotClient（单例）            │
                    │    · 收消息 → onMessage 业务         │
                    │    · 发消息 → sendMsg / sendGroupMsg │
                    │              ▲                      │
                    │              │ 同一 client 实例       │
  其它程序 ──HTTP──►│  HTTP API（仅内网 + API Key）        │
                    │    POST /api/send/user             │
                    │    POST /api/send/group            │
                    └─────────────────────────────────────┘
```

要点：

1. **一个 `WeComBotClient` 单例**：长连接负责「收」；对外 API 只调这个实例的 `sendMsg` / `sendGroupMsg`。
2. **HTTP 层**：只做鉴权、参数校验、调用 client；**不要在 HTTP 里再 new 一个 WSClient**。
3. **就绪条件**：发送前 WebSocket 应已 `authenticated`；未连上时可返回 **503**，或做短期队列（进阶）。

## 何时拆进程（可选）

| 场景 | 做法 |
|------|------|
| 调用量小、部署简单 | **单进程**（当前方案）即可。 |
| HTTP 与 WS 要独立扩缩容 | **进程 A**：只跑 WS + 内嵌轻量队列；**进程 B**：HTTP 通过 Redis 发任务，A 消费后 `sendMsg`。 |
| 多语言调用方 | HTTP 或消息队列统一入口，仍由持有 WS 的进程执行发送。 |

## 安全

- API **不要暴露公网**；必须则 **TLS + 强 API Key / mTLS**。
- `.env` 中 `INTERNAL_API_KEY` 与企微 secret 同级保护。

## 代码入口

- 被动逻辑：`src/main.ts`（`onMessage` 等）。
- 对外发送：`src/api/sendApi.ts`（HTTP）；`main.ts` 在 `authenticated` 后 `listen`。
