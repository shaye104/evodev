import { nowIso } from './utils.js';

const MAX_ATTACHMENT_BYTES = 500 * 1024; // 500KB

class AttachmentValidationError extends Error {
  constructor(errors = []) {
    super('One or more attachments were rejected');
    this.name = 'AttachmentValidationError';
    this.status = 400;
    this.errors = errors;
  }
}

function extOf(name = '') {
  const base = String(name).split(/[\\/]/).pop() || '';
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function isLikelyText(bytes) {
  if (!bytes || !bytes.length) return true;
  let bad = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0) return false; // null byte => binary
    // allow tab/newline/cr plus printable ASCII; treat others as "maybe binary"
    if (!(b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126))) bad++;
  }
  // tolerate some UTF-8/high bytes, but not too many
  return bad / bytes.length < 0.2;
}

function sniffMimeFromHead(headBytes) {
  if (!headBytes || headBytes.length < 12) return '';
  // PNG
  if (
    headBytes[0] === 0x89 &&
    headBytes[1] === 0x50 &&
    headBytes[2] === 0x4e &&
    headBytes[3] === 0x47
  )
    return 'image/png';
  // JPEG
  if (headBytes[0] === 0xff && headBytes[1] === 0xd8 && headBytes[2] === 0xff) return 'image/jpeg';
  // GIF
  if (headBytes[0] === 0x47 && headBytes[1] === 0x49 && headBytes[2] === 0x46) return 'image/gif';
  // WebP: RIFF....WEBP
  if (
    headBytes[0] === 0x52 &&
    headBytes[1] === 0x49 &&
    headBytes[2] === 0x46 &&
    headBytes[3] === 0x46 &&
    headBytes[8] === 0x57 &&
    headBytes[9] === 0x45 &&
    headBytes[10] === 0x42 &&
    headBytes[11] === 0x50
  )
    return 'image/webp';
  // PDF
  if (headBytes[0] === 0x25 && headBytes[1] === 0x50 && headBytes[2] === 0x44 && headBytes[3] === 0x46)
    return 'application/pdf';
  // WebM/Matroska: 1A 45 DF A3
  if (headBytes[0] === 0x1a && headBytes[1] === 0x45 && headBytes[2] === 0xdf && headBytes[3] === 0xa3)
    return 'video/webm';
  // MP4/MOV: ....ftyp
  if (headBytes[4] === 0x66 && headBytes[5] === 0x74 && headBytes[6] === 0x79 && headBytes[7] === 0x70)
    return 'video/mp4';
  return '';
}

async function validateAttachment(file) {
  const name = String(file?.name || '');
  const ext = extOf(name);
  const size = Number(file?.size || 0) || 0;
  if (!size) return { ok: false, reason: 'Empty file' };
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: `File is too large (max ${MAX_ATTACHMENT_BYTES} bytes)` };
  }

  // Block obviously risky file types by extension. (This is a support system; attachments are downloaded.)
  const blockedExt = new Set([
    'exe',
    'msi',
    'bat',
    'cmd',
    'com',
    'scr',
    'ps1',
    'vbs',
    'js',
    'mjs',
    'cjs',
    'html',
    'htm',
    'xhtml',
    'svg',
    'sh',
    'jar',
    'dll',
    'so',
    'dylib',
    'apk',
    'ipa',
    'zip',
    '7z',
    'rar',
    'gz',
    'tgz',
  ]);
  if (blockedExt.has(ext)) {
    return { ok: false, reason: `File type .${ext} is not allowed` };
  }

  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const sniffed = sniffMimeFromHead(head);
  const declared = String(file?.type || '').toLowerCase();

  // Allow common safe binary types (images, pdf, video).
  const allowedBinary = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/webm',
  ]);
  if (sniffed && allowedBinary.has(sniffed)) return { ok: true, mime: sniffed };

  // Allow Roblox model files explicitly by extension (rbxm = binary, rbxmx = xml).
  // These won't be detected by our basic sniffing.
  if (ext === 'rbxm' || ext === 'rbxmx') {
    return { ok: true, mime: 'application/octet-stream' };
  }

  // Treat remaining as text-like (Roblox scripts, logs, etc).
  const allowedTextExt = new Set(['txt', 'log', 'lua', 'json', 'md']);
  if (!allowedTextExt.has(ext) && declared && declared.startsWith('text/')) {
    // If browser provided a text/* type but extension isn't in allowlist, still reject.
    return { ok: false, reason: `File type .${ext || '(unknown)'} is not allowed` };
  }

  const sample = new Uint8Array(await file.slice(0, Math.min(size, 4096)).arrayBuffer());
  if (!isLikelyText(sample)) {
    return { ok: false, reason: 'Unrecognized or unsafe file type' };
  }
  if (!allowedTextExt.has(ext)) {
    return { ok: false, reason: `Text attachment must be one of: ${Array.from(allowedTextExt).join(', ')}` };
  }
  const mime = ext === 'json' ? 'application/json' : 'text/plain; charset=utf-8';
  return { ok: true, mime };
}

async function inspectAttachments(files = []) {
  const inspected = [];
  const errors = [];
  for (const file of files) {
    if (!file || !file.name) continue;
    const verdict = await validateAttachment(file);
    if (!verdict.ok) {
      errors.push({ filename: String(file.name || 'attachment'), reason: verdict.reason || 'Rejected' });
      continue;
    }
    inspected.push({ file, mime: verdict.mime || file.type || 'application/octet-stream' });
  }
  return { inspected, errors };
}

async function checkAttachments(files = []) {
  const { errors } = await inspectAttachments(files);
  if (errors.length) throw new AttachmentValidationError(errors);
}

async function storeAttachments(env, ticketPublicId, messageId, files = []) {
  const saved = [];
  const { inspected, errors } = await inspectAttachments(files);
  if (errors.length) throw new AttachmentValidationError(errors);

  for (const { file, mime } of inspected) {
    const safeName = `${Date.now()}-${file.name}`.replace(/[^A-Za-z0-9_.-]/g, '_');
    const key = `${ticketPublicId}/${safeName}`;
    await env.R2.put(key, file.stream(), {
      httpMetadata: { contentType: mime || 'application/octet-stream' },
    });
    const urlBase = env.R2_PUBLIC_BASE || '';
    const storageUrl = urlBase ? `${urlBase.replace(/\/$/, '')}/${key}` : '';
    await env.DB.prepare(
      `
      INSERT INTO ticket_attachments (
        ticket_message_id, filename, storage_path, storage_url,
        mime_type, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        messageId,
        file.name,
        key,
        storageUrl,
        mime || '',
        file.size || 0,
        nowIso()
      )
      .run();
    saved.push({
      filename: file.name,
      storage_path: key,
      storage_url: storageUrl,
    });
  }
  return saved;
}

export { storeAttachments, checkAttachments, AttachmentValidationError, MAX_ATTACHMENT_BYTES };
