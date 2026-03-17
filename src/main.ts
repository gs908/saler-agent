/**
 * 智能机器人「接收消息」分类型处理
 * 文档：https://developer.work.weixin.qq.com/document/path/100719
 *
 * - text：文本，可选 quote 引用
 * - image / file / video：url 对应加密资源，需 aeskey + downloadFile（与回调 AESKey 相同，见文档结构体说明）
 * - mixed：msg_item 中文本 + 图片组合
 * - voice：voice.content 已为语音转文字，无需再下语音文件
 * - stream：流式刷新，需按 stream.id 继续 replyStream
 * - location：SDK 原版不 emit，已 patch aibot-node-sdk default 分支；须尽快 replyText，否则会提示「不支持此类型」
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WsFrame } from '@wecom/aibot-node-sdk';
import { startSendApi } from './api/sendApi.js';
import { loadInternalApiConfig } from './client/config.js';
import { WeComBotClient } from './client/WeComBotClient.js';

const client = new WeComBotClient();
let sendApiServer: ReturnType<typeof startSendApi> | null = null;

const DIR_IMAGES = path.join(process.cwd(), 'received', 'images');
const DIR_FILES = path.join(process.cwd(), 'received', 'files');
const DIR_VIDEOS = path.join(process.cwd(), 'received', 'videos');

/** 文档：图片/文件/视频仅给 url 时，解密密钥与「回调加解密」相同；长连接里 body 常带 aeskey，否则可配环境变量 */
function resourceAesKey(frame: WsFrame, fromField: { aeskey?: string } | undefined): string | null {
  if (fromField?.aeskey) return fromField.aeskey;
  const fallback =
    process.env.WECOM_RESOURCE_AESKEY ||
    process.env.WECOM_ENCODING_AES_KEY ||
    process.env.WECOM_CALLBACK_ENCODING_AES_KEY;
  return fallback?.trim() || null;
}

const seenMsgIds = new Set<string>();
function dedupe(msgid: string | undefined): boolean {
  if (!msgid) return false;
  if (seenMsgIds.has(msgid)) return true;
  seenMsgIds.add(msgid);
  if (seenMsgIds.size > 5000) {
    const it = seenMsgIds.values();
    for (let i = 0; i < 1000; i++) seenMsgIds.delete(it.next().value as string);
  }
  return false;
}

function bodyOf(frame: WsFrame): Record<string, unknown> {
  return (frame.body as Record<string, unknown>) ?? {};
}

/** 仅去掉路径与 Windows 非法字符，保留中文等 Unicode，避免整段被改成 _ */
function sanitizeFileBasename(name: string, fallbackStem: string, defaultSuffix: string): string {
  let base = name.replace(/^.*[/\\]/, '').trim() || '';
  // Windows 非法: <>:"/\|?* 及控制符
  base = base.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/\s+$/g, '');
  const extMatch = base.match(/(\.[a-zA-Z0-9]{1,10})$/);
  const ext = extMatch?.[1] ?? defaultSuffix;
  let stem = extMatch ? base.slice(0, -ext.length) : base;
  stem = stem.replace(/\.+$/g, '').trim();
  // 若 stem 为空或全是点/下划线（曾被错误 sanitize 的结果），用 msgid 作 stem
  if (!stem || /^[_.\s-]+$/.test(stem)) {
    stem = fallbackStem.replace(/[^\w.-]/g, '_').slice(0, 80) || `file_${Date.now()}`;
  }
  const out = `${stem}${ext.startsWith('.') ? ext : `.${ext}`}`;
  return out.length > 200 ? `${stem.slice(0, 100)}${ext}` : out;
}

async function saveDecrypted(
  dir: string,
  msgid: string | undefined,
  defaultSuffix: string,
  filenameHint: string | undefined,
  buffer: Buffer
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const fallbackStem = (msgid ?? `t${Date.now()}`).toString().replace(/[^\w-]/g, '_');
  const base =
    filenameHint?.trim() ||
    `${fallbackStem}${defaultSuffix.startsWith('.') ? defaultSuffix : `.${defaultSuffix}`}`;
  const safe = sanitizeFileBasename(base, fallbackStem, defaultSuffix.startsWith('.') ? defaultSuffix : `.${defaultSuffix}`);
  const savePath = path.join(dir, safe);
  await fs.writeFile(savePath, buffer);
  return savePath;
}

async function downloadResource(
  url: string,
  aeskey: string,
  msgid: string | undefined,
  dir: string,
  defaultSuffix: string,
  bodyFilename?: string | undefined
): Promise<{ bytes: number; path: string }> {
  const { buffer, filename } = await client.downloadFile(url, aeskey);
  const hint = bodyFilename?.trim() || filename?.trim();
  const p = await saveDecrypted(dir, msgid, defaultSuffix, hint, buffer);
  return { bytes: buffer.length, path: p };
}

// ---------- text（含 quote 引用）----------
client.onMessage('text', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const text = (b.text as { content?: string })?.content?.trim() ?? '';
  const quote = b.quote as Record<string, unknown> | undefined;
  let quoteHint = '';
  if (quote?.msgtype === 'text' && (quote.text as { content?: string })?.content) {
    quoteHint = ` [引用: ${(quote.text as { content: string }).content.slice(0, 80)}…]`;
  }
  if (!text && !quoteHint) return;
  await client.replyText(frame, `收到文本${quoteHint}：${text || '(仅引用)'}`);
});

// ---------- image ----------
client.onMessage('image', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const image = b.image as { url?: string; aeskey?: string } | undefined;
  const aes = resourceAesKey(frame, image);
  if (!image?.url || !aes) {
    await client.replyText(
      frame,
      '图片缺少 url 或解密密钥；若回调体无 aeskey，请配置 WECOM_RESOURCE_AESKEY（与回调加解密 AESKey 一致）'
    );
    return;
  }
  try {
    const { bytes } = await downloadResource(image.url, aes, b.msgid as string, DIR_IMAGES, '.png');
    await client.replyText(frame, `已收到图片（${bytes} 字节），已保存到 received/images`);
  } catch (e) {
    console.error('image downloadFile', e);
    await client.replyText(frame, '图片下载或解密失败（url 约 5 分钟内有效）');
  }
});

// ---------- file（≤100M）----------
client.onMessage('file', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const file = b.file as { url?: string; aeskey?: string } | undefined;
  const aes = resourceAesKey(frame, file);
  if (!file?.url || !aes) {
    await client.replyText(frame, '文件缺少 url 或解密密钥，请配置 WECOM_RESOURCE_AESKEY');
    return;
  }
  try {
    const bodyName = (file as { filename?: string }).filename;
    const { bytes } = await downloadResource(
      file.url,
      aes,
      b.msgid as string,
      DIR_FILES,
      '.bin',
      bodyName
    );
    await client.replyText(frame, `已收到文件（${bytes} 字节），已保存到 received/files`);
  } catch (e) {
    console.error('file downloadFile', e);
    await client.replyText(frame, '文件下载或解密失败');
  }
});

// ---------- video（≤100M，与文件同为加密 url）----------
client.onMessage('video', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const video = b.video as { url?: string; aeskey?: string } | undefined;
  const aes = resourceAesKey(frame, video);
  if (!video?.url || !aes) {
    await client.replyText(frame, '视频缺少 url 或解密密钥，请配置 WECOM_RESOURCE_AESKEY');
    return;
  }
  try {
    const { bytes } = await downloadResource(video.url, aes, b.msgid as string, DIR_VIDEOS, '.mp4');
    await client.replyText(frame, `已收到视频（${bytes} 字节），已保存到 received/videos`);
  } catch (e) {
    console.error('video downloadFile', e);
    await client.replyText(frame, '视频下载或解密失败');
  }
});

// ---------- voice（文档：content 为语音转文字，单聊）----------
client.onMessage('voice', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const content = (b.voice as { content?: string })?.content?.trim() ?? '';
  await client.replyText(
    frame,
    content ? `收到语音（识别）：${content}` : '收到语音（无识别文本）'
  );
});

// ---------- mixed：群/单聊图文混排 ----------
client.onMessage('mixed', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const mixed = b.mixed as { msg_item?: Array<Record<string, unknown>> } | undefined;
  const items = mixed?.msg_item ?? [];
  const textParts: string[] = [];
  let imageCount = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.msgtype === 'text' && (it.text as { content?: string })?.content) {
      textParts.push((it.text as { content: string }).content);
    }
    if (it.msgtype === 'image') {
      const img = it.image as { url?: string; aeskey?: string } | undefined;
      const aes = img?.aeskey || resourceAesKey(frame, img);
      if (img?.url && aes) {
        try {
          await downloadResource(img.url, aes, `${String(b.msgid)}_${i}`, DIR_IMAGES, '.png');
          imageCount++;
        } catch (e) {
          console.error('mixed image', e);
        }
      }
    }
  }
  const summary = [
    textParts.length ? `文本：${textParts.join(' / ')}` : '',
    imageCount ? `图片 ${imageCount} 张已保存 received/images` : '',
  ]
    .filter(Boolean)
    .join('；');
  await client.replyText(frame, summary || '收到图文混排（无文本或未解析到图片）');
});

// ---------- 定位（卡片）：尽快回复，避免客户端默认「不支持此类型」----------
client.onMessage('location', async (_data, frame) => {
  const b = bodyOf(frame);
  if (dedupe(b.msgid as string | undefined)) return;
  const loc = b.location as {
    latitude?: number;
    longitude?: number;
    name?: string;
    label?: string;
    address?: string;
  } | undefined;
  const label = loc?.label ?? loc?.name ?? '位置';
  const addr = loc?.address ?? '';
  const lat = loc?.latitude ?? '';
  const lng = loc?.longitude ?? '';
  const line = [label, addr, lat !== '' && lng !== '' ? `${lat},${lng}` : '']
    .filter(Boolean)
    .join(' ');
  await client.replyText(frame, line ? `收到定位：${line}` : '收到定位消息。');
});

// ---------- stream：流式消息刷新，需用 stream.id 续写 replyStream ----------
client.onMessage('stream', async (_data, frame) => {
  const b = bodyOf(frame);
  const streamId = (b.stream as { id?: string })?.id;
  if (!streamId) {
    console.warn('[stream] missing stream.id', b);
    return;
  }
  // 文档：根据 stream.id 返回对应流式回复；此处示例为一次性结束，可改为多段 replyStream(..., false) 再 true
  try {
    await client.replyStream(frame, streamId, '（流式刷新已收到，此处为示例回复。可接大模型流式输出。）', true);
  } catch (e) {
    console.error('replyStream stream', e);
  }
});

client.on('authenticated', () => {
  const apiConfig = loadInternalApiConfig();
  if (apiConfig && !sendApiServer) {
    sendApiServer = startSendApi(client, apiConfig);
  } else if (!apiConfig) {
    console.info('[send-api] INTERNAL_API_TOKENS unset — HTTP send API disabled');
  }
});

client.connect();

function shutdown(): void {
  try {
    sendApiServer?.close();
  } catch {
    /* ignore */
  }
  try {
    client.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
