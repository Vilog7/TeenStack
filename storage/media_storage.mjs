import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_UPLOADS_DIR = path.join(__dirname, 'uploads');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // 15 MB

const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Inspects file magic bytes so forged MIME types (e.g. HTML/JS disguised as image/jpeg)
 * are strictly rejected before touching disk.
 */
export function detectMediaMagicBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: '.jpg', kind: 'image' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: '.png', kind: 'image' };
  }

  // GIF87a / GIF89a
  const gifSig = buf.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { mimeType: 'image/gif', ext: '.gif', kind: 'image' };
  }

  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: '.webp', kind: 'image' };
  }

  // MP4 / ISO BMFF: ....ftyp
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'video/mp4', ext: '.mp4', kind: 'video' };
  }

  // WEBM / Matroska: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: 'video/webm', ext: '.webm', kind: 'video' };
  }

  return null;
}

export function createMediaStorageService({ db, uploadsDir = DEFAULT_UPLOADS_DIR }) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  function decodeUploadPayload(dataUrlOrBuffer) {
    if (Buffer.isBuffer(dataUrlOrBuffer)) {
      return dataUrlOrBuffer;
    }
    const str = String(dataUrlOrBuffer || '').trim();
    const match = str.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (match) {
      return Buffer.from(match[2], 'base64');
    }
    if (/^[A-Za-z0-9+/=\s]{16,}$/.test(str)) {
      return Buffer.from(str, 'base64');
    }
    const err = new Error('Invalid media payload. Expected base64 data URL or binary upload.');
    err.status = 400;
    err.code = 'INVALID_MEDIA_PAYLOAD';
    throw err;
  }

  function saveUploadedMedia({ userId, dataUrlOrBuffer, purpose = 'post' }) {
    const buffer = decodeUploadPayload(dataUrlOrBuffer);
    const detected = detectMediaMagicBytes(buffer);

    if (!detected) {
      const err = new Error(
        'Unsupported or invalid media file. Allowed formats: JPEG, PNG, WEBP, GIF, MP4, and WEBM.'
      );
      err.status = 415;
      err.code = 'UNSUPPORTED_MEDIA_TYPE';
      throw err;
    }

    const maxBytes = detected.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (buffer.length > maxBytes) {
      const limitMb = Math.round(maxBytes / (1024 * 1024));
      const err = new Error(
        `Uploaded ${detected.kind} exceeds the ${limitMb} MB maximum size limit.`
      );
      err.status = 413;
      err.code = 'MEDIA_TOO_LARGE';
      throw err;
    }

    const cleanPurpose = ['avatar', 'post', 'story', 'reel'].includes(purpose) ? purpose : 'post';
    const mediaId = `med_${randomBytes(8).toString('hex')}`;
    const filename = `${cleanPurpose}_${randomBytes(10).toString('hex')}${detected.ext}`;
    const targetPath = path.join(uploadsDir, filename);

    fs.writeFileSync(targetPath, buffer);

    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO media_assets (id, owner_id, filename, mime_type, byte_size, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(mediaId, userId, filename, detected.mimeType, buffer.length, cleanPurpose, createdAt);

    return {
      mediaId,
      filename,
      url: `/uploads/${filename}`,
      mimeType: detected.mimeType,
      byteSize: buffer.length,
      kind: detected.kind,
      createdAt,
    };
  }

  function persistInlineDataUrlIfNeeded({ userId, maybeUrl, purpose = 'post' }) {
    if (typeof maybeUrl !== 'string' || !maybeUrl.startsWith('data:')) {
      return maybeUrl || '';
    }
    const saved = saveUploadedMedia({
      userId,
      dataUrlOrBuffer: maybeUrl,
      purpose,
    });
    return saved.url;
  }

  function resolveUploadFile(rawFilename) {
    const filename = String(rawFilename || '').trim();
    if (!/^[a-z0-9_-]{3,64}\.(jpg|png|gif|webp|mp4|webm)$/.test(filename)) {
      return null;
    }
    const candidate = path.resolve(uploadsDir, filename);
    if (!candidate.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return null;
    }
    if (!fs.existsSync(candidate)) return null;
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return null;
    const ext = path.extname(filename).toLowerCase();
    return {
      filePath: candidate,
      mimeType: EXTENSION_MIME_MAP[ext] || 'application/octet-stream',
      byteSize: stat.size,
    };
  }

  function unlinkUploadUrlIfOwned(maybeUrl) {
    const str = String(maybeUrl || '');
    if (!str.startsWith('/uploads/')) return;
    const filename = str.slice('/uploads/'.length);
    if (!/^[a-z0-9_-]{3,64}\.(jpg|png|gif|webp|mp4|webm)$/.test(filename)) return;
    const targetPath = path.resolve(uploadsDir, filename);
    try {
      if (targetPath.startsWith(path.resolve(uploadsDir) + path.sep) && fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      db.prepare('DELETE FROM media_assets WHERE filename = ?').run(filename);
    } catch {
      // ignore fs race
    }
  }

  return {
    uploadsDir,
    saveUploadedMedia,
    persistInlineDataUrlIfNeeded,
    resolveUploadFile,
    unlinkUploadUrlIfOwned,
  };
}
