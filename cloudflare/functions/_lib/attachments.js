import { nowIso } from './utils.js';

async function storeAttachments(env, ticketPublicId, messageId, files = []) {
  const saved = [];
  for (const file of files) {
    if (!file || !file.name) continue;
    const safeName = `${Date.now()}-${file.name}`.replace(/[^A-Za-z0-9_.-]/g, '_');
    const key = `${ticketPublicId}/${safeName}`;
    await env.R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
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
        file.type || '',
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

export { storeAttachments };
