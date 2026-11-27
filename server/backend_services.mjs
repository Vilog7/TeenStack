import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword, hashToken, verifyPassword } from './security.mjs';

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

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function createBackendCompletionServices({ db, cryptoCtx, engine, uploadsDir }) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  // ===========================================================================
  // 1. BINARY MEDIA UPLOAD & SERVING SERVICE
  // ===========================================================================
  function decodeUploadPayload(dataUrlOrBuffer) {
    if (Buffer.isBuffer(dataUrlOrBuffer)) {
      return dataUrlOrBuffer;
    }
    const str = String(dataUrlOrBuffer || '').trim();
    const match = str.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (match) {
      return Buffer.from(match[2], 'base64');
    }
    // Support raw base64 string without data: prefix
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

  // ===========================================================================
  // 2. USER BLOCKING & TEEN SAFETY REPORTING / MODERATION
  // ===========================================================================
  function getBlockedIdsSet(userId) {
    const set = new Set();
    if (!userId) return set;
    const rows = db
      .prepare('SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?')
      .all(userId, userId);
    for (const r of rows) {
      if (r.blocker_id !== userId) set.add(r.blocker_id);
      if (r.blocked_id !== userId) set.add(r.blocked_id);
    }
    return set;
  }

  function isEitherBlocked(userA, userB) {
    if (!userA || !userB) return false;
    const row = db
      .prepare(
        'SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1'
      )
      .get(userA, userB, userB, userA);
    return Boolean(row);
  }

  function listMyBlockedUsers(blockerId) {
    const rows = db
      .prepare(`
        SELECT b.blocked_id, b.reason, b.created_at, u.full_name, u.username
        FROM user_blocks b
        JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = ?
        ORDER BY datetime(b.created_at) DESC
      `)
      .all(blockerId);
    return rows.map((r) => ({
      id: r.blocked_id,
      fullName: r.full_name,
      username: r.username,
      reason: r.reason,
      blockedAt: r.created_at,
    }));
  }

  function toggleUserBlock({ blockerId, targetUserId, reason = '' }) {
    if (!targetUserId || blockerId === targetUserId) {
      const err = new Error('Invalid block target.');
      err.status = 400;
      throw err;
    }
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!target) {
      const err = new Error('Target user not found.');
      err.status = 404;
      throw err;
    }

    const existing = db
      .prepare('SELECT * FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?')
      .get(blockerId, targetUserId);

    let blocked = false;
    if (existing) {
      db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').run(
        blockerId,
        targetUserId
      );
      engine.writeAuditLog({
        userReference: blockerId,
        eventType: 'USER_UNBLOCKED_PEER',
        eventStatus: 'UNBLOCKED',
        actorRole: 'student',
        metadata: { targetUserId },
      });
    } else {
      const nowIso = new Date().toISOString();
      db.prepare(
        'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, ?)'
      ).run(blockerId, targetUserId, String(reason || '').trim().slice(0, 200), nowIso);

      // Sever existing friendships & connect interactions in both directions
      db.prepare(
        'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
      ).run(blockerId, targetUserId, targetUserId, blockerId);
      db.prepare(
        "DELETE FROM user_interactions WHERE target_type = 'connect' AND ((user_id = ? AND target_id = ?) OR (user_id = ? AND target_id = ?))"
      ).run(blockerId, targetUserId, targetUserId, blockerId);

      blocked = true;
      engine.writeAuditLog({
        userReference: blockerId,
        eventType: 'USER_BLOCKED_PEER',
        eventStatus: 'BLOCKED',
        actorRole: 'student',
        metadata: { targetUserId },
      });
    }

    return {
      blocked,
      blockedUsers: listMyBlockedUsers(blockerId),
    };
  }

  function submitSafetyReport({
    reporterId,
    targetType,
    targetId,
    reasonCategory,
    details = '',
  }) {
    const allowedTypes = new Set(['post', 'comment', 'message', 'user']);
    if (!allowedTypes.has(targetType) || !targetId) {
      const err = new Error('Valid targetType (post, comment, message, user) and targetId are required.');
      err.status = 400;
      throw err;
    }
    const cleanReason = String(reasonCategory || '').trim().slice(0, 80);
    if (!cleanReason) {
      const err = new Error('Please select a report reason.');
      err.status = 400;
      throw err;
    }

    let exists = null;
    if (targetType === 'post') {
      exists = db.prepare('SELECT id FROM posts WHERE id = ?').get(targetId);
    } else if (targetType === 'comment') {
      exists = db.prepare('SELECT id FROM post_comments WHERE id = ?').get(targetId);
    } else if (targetType === 'message') {
      exists = db.prepare('SELECT id FROM messages WHERE id = ?').get(targetId);
    } else if (targetType === 'user') {
      exists = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
    }

    if (!exists) {
      const err = new Error(`Reported ${targetType} was not found.`);
      err.status = 404;
      throw err;
    }

    const duplicateOpen = db
      .prepare(
        "SELECT id, status, created_at FROM safety_reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'OPEN'"
      )
      .get(reporterId, targetType, targetId);
    if (duplicateOpen) {
      return {
        reportId: duplicateOpen.id,
        status: duplicateOpen.status,
        createdAt: duplicateOpen.created_at,
        duplicate: true,
      };
    }

    const reportId = `rpt_${randomBytes(6).toString('hex')}`;
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO safety_reports (id, reporter_id, target_type, target_id, reason_category, details, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      reportId,
      reporterId,
      targetType,
      String(targetId),
      cleanReason,
      String(details || '').trim().slice(0, 500),
      createdAt
    );

    engine.writeAuditLog({
      userReference: reporterId,
      eventType: 'SAFETY_REPORT_SUBMITTED',
      eventStatus: 'OPEN',
      actorRole: 'student',
      metadata: { reportId, targetType, targetId, reasonCategory: cleanReason },
    });

    return { reportId, status: 'OPEN', createdAt };
  }

  function listSafetyReports({ status = null } = {}) {
    const rows = status
      ? db
          .prepare(`
            SELECT r.*, u.username AS reporter_username
            FROM safety_reports r
            LEFT JOIN users u ON u.id = r.reporter_id
            WHERE r.status = ?
            ORDER BY datetime(r.created_at) DESC
            LIMIT 100
          `)
          .all(status)
      : db
          .prepare(`
            SELECT r.*, u.username AS reporter_username
            FROM safety_reports r
            LEFT JOIN users u ON u.id = r.reporter_id
            ORDER BY datetime(r.created_at) DESC
            LIMIT 100
          `)
          .all();

    return rows.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      reporterUsername: r.reporter_username || 'deleted_user',
      targetType: r.target_type,
      targetId: r.target_id,
      reasonCategory: r.reason_category,
      details: r.details,
      status: r.status,
      resolutionNote: r.resolution_note,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    }));
  }

  function resolveSafetyReport({
    reportId,
    status,
    resolutionNote = '',
    removeTargetContent = false,
    reviewer = 'compliance_admin',
  }) {
    if (status !== 'ACTIONED' && status !== 'DISMISSED') {
      const err = new Error('Resolution status must be ACTIONED or DISMISSED.');
      err.status = 400;
      throw err;
    }
    const row = db.prepare('SELECT * FROM safety_reports WHERE id = ?').get(reportId);
    if (!row) {
      const err = new Error('Safety report not found.');
      err.status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE safety_reports
      SET status = ?, resolution_note = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(status, String(resolutionNote || '').trim().slice(0, 300), reviewer, nowIso, reportId);

    if (status === 'ACTIONED' && removeTargetContent) {
      if (row.target_type === 'post') {
        const postRow = db.prepare('SELECT media_meta FROM posts WHERE id = ?').get(row.target_id);
        if (postRow) {
          const meta = safeJsonParse(postRow.media_meta, {});
          unlinkUploadUrlIfOwned(meta.imageUrl);
          unlinkUploadUrlIfOwned(meta.videoUrl);
        }
        db.prepare('DELETE FROM posts WHERE id = ?').run(row.target_id);
      } else if (row.target_type === 'comment') {
        const cRow = db.prepare('SELECT post_id FROM post_comments WHERE id = ?').get(row.target_id);
        db.prepare('DELETE FROM post_comments WHERE id = ?').run(row.target_id);
        if (cRow) {
          const rem = db
            .prepare(
              'SELECT id, author_id AS authorId, author_name AS author, author_avatar AS avatar, text FROM post_comments WHERE post_id = ? ORDER BY datetime(created_at) ASC'
            )
            .all(cRow.post_id)
            .map((c) => ({ ...c, time: 'Just now' }));
          db.prepare('UPDATE posts SET comments_json = ? WHERE id = ?').run(
            JSON.stringify(rem),
            cRow.post_id
          );
        }
      } else if (row.target_type === 'message') {
        db.prepare('DELETE FROM messages WHERE id = ?').run(row.target_id);
      }
    }

    engine.writeAuditLog({
      userReference: row.reporter_id,
      eventType: 'SAFETY_REPORT_RESOLVED',
      eventStatus: status,
      actorRole: 'compliance_admin',
      metadata: { reportId, targetType: row.target_type, removeTargetContent },
    });

    return listSafetyReports().find((r) => r.id === reportId);
  }

  // ===========================================================================
  // 3. ACCOUNT LIFECYCLE: PASSWORD CHANGE, SESSION MANAGEMENT & DPDP EXPORT
  // ===========================================================================
  function changeAccountPassword({ userRow, currentPassword, newPassword, keepSessionToken = '' }) {
    if (!currentPassword || !verifyPassword(String(currentPassword), userRow.password_hash)) {
      const err = new Error('Current password is incorrect.');
      err.status = 401;
      err.code = 'INVALID_CURRENT_PASSWORD';
      throw err;
    }
    if (!newPassword || String(newPassword).length < 8) {
      const err = new Error('New password must be at least 8 characters long.');
      err.status = 400;
      throw err;
    }
    if (String(currentPassword) === String(newPassword)) {
      const err = new Error('New password must be different from your current password.');
      err.status = 400;
      throw err;
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(String(newPassword)),
      userRow.id
    );

    if (keepSessionToken) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(
        userRow.id,
        keepSessionToken
      );
    } else {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userRow.id);
    }

    engine.writeAuditLog({
      userReference: userRow.id,
      eventType: 'ACCOUNT_PASSWORD_CHANGED',
      eventStatus: 'SUCCESS',
      actorRole: userRow.role || 'student',
    });

    return { ok: true };
  }

  function listActiveSessions(userId, currentToken = '') {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, Date.now());
    const rows = db
      .prepare('SELECT token, role, created_at, user_agent, expires_at FROM sessions WHERE user_id = ?')
      .all(userId);
    return rows.map((s) => ({
      sessionId: hashToken(s.token).slice(0, 12),
      role: s.role || 'student',
      userAgent: s.user_agent || 'Browser Session',
      createdAt: s.created_at || null,
      expiresAt: new Date(s.expires_at).toISOString(),
      isCurrent: s.token === currentToken,
    }));
  }

  function revokeSessionById({ userId, sessionId, currentToken = '' }) {
    if (sessionId === 'others') {
      const res = db
        .prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
        .run(userId, currentToken);
      return {
        revokedCount: res.changes || 0,
        sessions: listActiveSessions(userId, currentToken),
      };
    }

    const rows = db.prepare('SELECT token FROM sessions WHERE user_id = ?').all(userId);
    let revokedCount = 0;
    for (const r of rows) {
      if (hashToken(r.token).slice(0, 12) === sessionId) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(r.token);
        revokedCount += 1;
      }
    }

    return {
      revokedCount,
      sessions: listActiveSessions(userId, currentToken),
    };
  }

  function exportUserDataBundle(userRow) {
    const profile = safeJsonParse(userRow.profile_json, {});
    const projects = db
      .prepare('SELECT id, title, summary, link, tag, created_at FROM student_projects WHERE user_id = ?')
      .all(userRow.id);
    const achievements = db
      .prepare('SELECT id, title, issuer, verified, created_at FROM student_achievements WHERE user_id = ?')
      .all(userRow.id);
    const posts = db
      .prepare(
        'SELECT id, category, title, content, media_type, media_meta, skill_tags, likes_count, shares_count, created_at, expires_at FROM posts WHERE author_id = ? ORDER BY datetime(created_at) DESC'
      )
      .all(userRow.id)
      .map((p) => ({
        ...p,
        media_meta: safeJsonParse(p.media_meta, {}),
        skill_tags: safeJsonParse(p.skill_tags, []),
      }));
    const comments = db
      .prepare('SELECT id, post_id, text, created_at FROM post_comments WHERE author_id = ?')
      .all(userRow.id);
    const applications = db
      .prepare('SELECT id, opportunity_id, pitch_note, status, created_at FROM opportunity_applications WHERE user_id = ?')
      .all(userRow.id);
    const courseProgress = db
      .prepare('SELECT course_id, module_code, completed_at FROM course_module_progress WHERE user_id = ?')
      .all(userRow.id);
    const ageVerifications = db
      .prepare(
        'SELECT id, provider_name, verification_status, verified_age_band, verification_timestamp, created_at FROM age_verifications WHERE user_id = ?'
      )
      .all(userRow.id);
    const parentVerifications = db
      .prepare(
        'SELECT id, parent_name, relationship_type, adult_verification_status, authority_verification_status, created_at FROM parent_verifications WHERE student_id = ?'
      )
      .all(userRow.id);
    const parentalConsents = db
      .prepare(
        'SELECT id, consent_status, consent_version, consent_timestamp, withdrawal_timestamp FROM parental_consents WHERE student_id = ?'
      )
      .all(userRow.id);

    engine.writeAuditLog({
      userReference: userRow.id,
      eventType: 'DPDP_PERSONAL_DATA_EXPORTED',
      eventStatus: 'SUCCESS',
      actorRole: userRow.role || 'student',
    });

    return {
      schemaVersion: 'DPDP-TEENSTACK-EXPORT-v2026.1',
      exportedAt: new Date().toISOString(),
      account: {
        id: userRow.id,
        fullName: userRow.full_name,
        username: userRow.username,
        email: cryptoCtx.decryptPII(userRow.email),
        mobile: cryptoCtx.decryptPII(userRow.mobile),
        declaredDob: cryptoCtx.decryptPII(userRow.declared_dob),
        verifiedAgeBand: userRow.verified_age_band,
        accountStatus: userRow.account_status,
        createdAt: userRow.created_at,
        profile,
      },
      portfolio: {
        projects,
        achievements,
      },
      activity: {
        posts,
        comments,
        opportunityApplications: applications,
        courseProgress,
      },
      complianceRecords: {
        ageVerifications,
        parentVerifications,
        parentalConsents,
      },
    };
  }

  // ===========================================================================
  // 4. AUTOMATED RETENTION & DPDP HARD-ERASURE SWEEP SCHEDULER
  // ===========================================================================
  function runMaintenanceSweep() {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const expiredSessions = db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(nowMs);

    const expiredResetTokens = db
      .prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ?')
      .run(nowMs);

    const expiredNonces = db
      .prepare('DELETE FROM webhook_replay_nonces WHERE received_at <= ?')
      .run(nowMs - 24 * 60 * 60 * 1000);

    // Purge expired 24h stories and unlink any uploaded story media assets
    const expiredStoryRows = db
      .prepare("SELECT id, media_meta FROM posts WHERE category = 'story' AND expires_at IS NOT NULL AND expires_at <= ?")
      .all(nowIso);
    for (const st of expiredStoryRows) {
      const meta = safeJsonParse(st.media_meta, {});
      unlinkUploadUrlIfOwned(meta.imageUrl);
      unlinkUploadUrlIfOwned(meta.videoUrl);
      db.prepare('DELETE FROM posts WHERE id = ?').run(st.id);
    }

    // Execute due DPDP Data Deletion Requests (scheduled_purge_at <= nowIso)
    const dueDeletions = db
      .prepare(
        "SELECT * FROM data_deletion_requests WHERE status = 'SCHEDULED' AND scheduled_purge_at <= ?"
      )
      .all(nowIso);

    let accountsPurged = 0;
    for (const reqRow of dueDeletions) {
      const uid = reqRow.user_id;
      const ownedMedia = db
        .prepare('SELECT filename FROM media_assets WHERE owner_id = ?')
        .all(uid);
      for (const m of ownedMedia) {
        unlinkUploadUrlIfOwned(`/uploads/${m.filename}`);
      }

      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM user_interactions WHERE user_id = ? OR target_id = ?').run(uid, uid);
      db.prepare('DELETE FROM messages WHERE sender_id = ?').run(uid);
      db.prepare('DELETE FROM posts WHERE author_id = ?').run(uid);
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);

      db.prepare(
        "UPDATE data_deletion_requests SET status = 'COMPLETED', completed_at = ? WHERE id = ?"
      ).run(nowIso, reqRow.id);

      engine.writeAuditLog({
        userReference: 'erased_subject',
        eventType: 'DPDP_HARD_ERASURE_COMPLETED',
        eventStatus: 'COMPLETED',
        actorRole: 'system_scheduler',
        metadata: { deletionRequestId: reqRow.id, reason: reqRow.reason },
      });
      accountsPurged += 1;
    }

    return {
      sweptAt: nowIso,
      expiredSessionsRemoved: expiredSessions.changes || 0,
      expiredResetTokensRemoved: expiredResetTokens.changes || 0,
      expiredNoncesRemoved: expiredNonces.changes || 0,
      expiredStoriesRemoved: expiredStoryRows.length,
      accountsPurged,
    };
  }

  return {
    saveUploadedMedia,
    persistInlineDataUrlIfNeeded,
    resolveUploadFile,
    unlinkUploadUrlIfOwned,
    getBlockedIdsSet,
    isEitherBlocked,
    listMyBlockedUsers,
    toggleUserBlock,
    submitSafetyReport,
    listSafetyReports,
    resolveSafetyReport,
    changeAccountPassword,
    listActiveSessions,
    revokeSessionById,
    exportUserDataBundle,
    runMaintenanceSweep,
  };
}
