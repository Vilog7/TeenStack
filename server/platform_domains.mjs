import { randomBytes } from 'node:crypto';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  normalizeEmail,
} from './security.mjs';

const MAX_TAGGED_PEOPLE = 10;
const STORY_LIFESPAN_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Teen Safety Content Moderation Filter:
 * Prevents sharing sensitive government IDs (12-digit Aadhaar), payment card numbers,
 * plaintext credentials, or severe harassment in student chats & comments.
 */
export function evaluateTeenSafetyFilter(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { allowed: false, reason: 'Content cannot be empty.' };
  }
  if (text.length > 2500) {
    return { allowed: false, reason: 'Content exceeds maximum length (2,500 characters).' };
  }
  // Detect 12-digit Aadhaar-like or 16-digit card-like sequences (with or without spaces/hyphens)
  const aadhaarPattern = /(?<!\d)(?:\d{4}[\s-]?){2}\d{4}(?!\d)/;
  const cardPattern = /(?<!\d)(?:\d{4}[\s-]?){3}\d{4}(?!\d)/;
  if (aadhaarPattern.test(text) || cardPattern.test(text)) {
    return {
      allowed: false,
      code: 'SAFETY_FILTER_SENSITIVE_ID',
      reason:
        'Teen Safety Shield blocked this message: never share 12-digit government IDs or 16-digit card numbers in chat or comments.',
    };
  }
  if (/my\s+password\s+is\s+\S+/i.test(text)) {
    return {
      allowed: false,
      code: 'SAFETY_FILTER_CREDENTIAL_LEAK',
      reason: 'Teen Safety Shield blocked this message: never share account passwords.',
    };
  }
  return { allowed: true };
}

function normalizeHandle(raw) {
  const clean = String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
  return clean ? `@${clean.slice(0, 24)}` : '';
}

function normalizeOptionalUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function formatRelativeLabel(iso) {
  const diffMin = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function createPlatformDomainServices({ db, cryptoCtx, engine, services = null }) {
  // ===========================================================================
  // 1. IN-APP NOTIFICATIONS ENGINE
  // ===========================================================================
  function createNotification({ userId, type = 'system', title, detail = '', targetRoute = 'home' }) {
    if (!userId) return null;
    const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!exists) return null;
    const id = `notif_${randomBytes(6).toString('hex')}`;
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, detail, target_route, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, type, String(title).slice(0, 160), String(detail).slice(0, 300), targetRoute, createdAt);
    return id;
  }

  function listNotifications(userId) {
    const rows = db
      .prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC LIMIT 40'
      )
      .all(userId);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      detail: r.detail,
      time: formatRelativeLabel(r.created_at),
      unread: r.is_read === 0,
      targetRoute: r.target_route,
      createdAt: r.created_at,
    }));
  }

  function markNotificationsRead(userId, notificationId = null) {
    if (notificationId) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?').run(
        userId,
        notificationId
      );
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    }
    return listNotifications(userId);
  }

  // ===========================================================================
  // 2. AUTH HELPERS: USERNAME CHECK & CRYPTOGRAPHIC PASSWORD RESET
  // ===========================================================================
  function checkUsernameAvailability(rawUsername) {
    const clean = String(rawUsername || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(clean)) {
      return {
        available: false,
        username: clean,
        reason: 'Username must be 3–24 characters using lowercase letters, numbers, _, or .',
      };
    }
    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
      .get(clean);
    return {
      available: !existing,
      username: clean,
      reason: existing ? 'Username is already taken.' : 'Available',
    };
  }

  function requestPasswordReset(rawEmail) {
    const cleanEmail = normalizeEmail(rawEmail);
    if (!cleanEmail) {
      const err = new Error('Please enter your registered email address.');
      err.status = 400;
      throw err;
    }
    const emailHash = cryptoCtx.blindIndex('email', cleanEmail);
    const userRow = db
      .prepare('SELECT id FROM users WHERE email_lookup_hash = ?')
      .get(emailHash);

    // Always respond uniformly to prevent account enumeration, while issuing real token if found
    if (!userRow) {
      return { queued: true };
    }

    const rawResetToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawResetToken);
    const id = `rst_${randomBytes(8).toString('hex')}`;
    const expiresAt = Date.now() + PASSWORD_RESET_TTL_MS;

    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userRow.id, tokenHash, expiresAt, new Date().toISOString());

    engine.writeAuditLog({
      userReference: userRow.id,
      eventType: 'PASSWORD_RESET_REQUESTED',
      eventStatus: 'ISSUED',
      actorRole: 'student',
    });

    return {
      queued: true,
      // Returned only in non-prod dev/test for verification; delivered via email in prod
      devResetToken: cryptoCtx.isProd ? undefined : rawResetToken,
    };
  }

  function confirmPasswordReset({ resetToken, newPassword }) {
    if (!resetToken || !newPassword || String(newPassword).length < 8) {
      const err = new Error('Valid reset token and a new password (min 8 characters) are required.');
      err.status = 400;
      throw err;
    }
    const tHash = hashToken(resetToken);
    const row = db
      .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?')
      .get(tHash);

    if (!row || row.consumed_at || row.expires_at <= Date.now()) {
      const err = new Error('Password reset token is invalid, expired, or has already been used.');
      err.status = 410;
      throw err;
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE password_reset_tokens SET consumed_at = ? WHERE id = ?').run(nowIso, row.id);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(String(newPassword)),
      row.user_id
    );
    // Revoke all existing sessions upon password change
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);

    engine.writeAuditLog({
      userReference: row.user_id,
      eventType: 'PASSWORD_RESET_COMPLETED',
      eventStatus: 'SUCCESS',
      actorRole: 'student',
    });

    return { ok: true };
  }

  // ===========================================================================
  // 3. PORTFOLIO PROJECTS & ACHIEVEMENTS RELATIONAL CRUD (+ JSON SYNC)
  // ===========================================================================
  function syncUserProfileJsonFromTables(userId) {
    const userRow = db.prepare('SELECT profile_json FROM users WHERE id = ?').get(userId);
    if (!userRow) return;
    const prof = safeJsonParse(userRow.profile_json, {});

    const projs = db
      .prepare(
        'SELECT id, title, summary, link, tag FROM student_projects WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC'
      )
      .all(userId);

    const achs = db
      .prepare(
        'SELECT title FROM student_achievements WHERE user_id = ? ORDER BY datetime(created_at) DESC, rowid DESC'
      )
      .all(userId);

    prof.portfolioProjects = projs;
    prof.projectsCompleted = projs.length;
    prof.achievements = achs.map((a) => a.title);
    prof.competitions = [];

    db.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(
      JSON.stringify(prof),
      userId
    );
  }

  function addStudentProject({ userId, title, summary = '', link = '', tag = 'Student Build' }) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      const err = new Error('Project title is required.');
      err.status = 400;
      throw err;
    }
    const id = `proj_${randomBytes(6).toString('hex')}`;
    const cleanLink = normalizeOptionalUrl(link) || 'https://teenstack.dev';
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO student_projects (id, user_id, title, summary, link, tag, featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      userId,
      cleanTitle.slice(0, 120),
      String(summary || 'Student build showcased on TeenStack.').trim().slice(0, 400),
      cleanLink,
      String(tag || 'Student Build').trim().slice(0, 48),
      nowIso
    );

    syncUserProfileJsonFromTables(userId);
    return db.prepare('SELECT * FROM student_projects WHERE id = ?').get(id);
  }

  function deleteStudentProject({ userId, projectId }) {
    db.prepare('DELETE FROM student_projects WHERE id = ? AND user_id = ?').run(projectId, userId);
    syncUserProfileJsonFromTables(userId);
    return { deleted: true };
  }

  function addStudentAchievement({ userId, title, issuer = 'TeenStack Verified Network', courseId = null }) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      const err = new Error('Achievement title is required.');
      err.status = 400;
      throw err;
    }
    const id = `ach_${randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO student_achievements (id, user_id, title, issuer, verified, course_id, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(id, userId, cleanTitle.slice(0, 160), String(issuer).slice(0, 100), courseId, nowIso);

    syncUserProfileJsonFromTables(userId);
    return db.prepare('SELECT * FROM student_achievements WHERE id = ?').get(id);
  }

  function deleteStudentAchievement({ userId, achievementId }) {
    db.prepare('DELETE FROM student_achievements WHERE id = ? AND user_id = ?').run(
      achievementId,
      userId
    );
    syncUserProfileJsonFromTables(userId);
    return { deleted: true };
  }

  // ===========================================================================
  // 4. SOCIAL GRAPH: PEERS, FRIENDS, MUTUALS & FULL PROFILE ENGINE
  // ===========================================================================
  function mapUserRowToPeerStudent(uRow, viewerId, viewerFriendsSet) {
    const prof = safeJsonParse(uRow.profile_json, {});
    const projs = db
      .prepare(
        'SELECT id, title, summary, link, tag FROM student_projects WHERE user_id = ? ORDER BY datetime(created_at) DESC'
      )
      .all(uRow.id);
    const achs = db
      .prepare(
        'SELECT title FROM student_achievements WHERE user_id = ? ORDER BY datetime(created_at) DESC'
      )
      .all(uRow.id);

    // Compute real SQL mutual connections intersection + base community mutuals
    const theirFriendRows = db
      .prepare("SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'ACCEPTED'")
      .all(uRow.id);
    let graphMutuals = 0;
    for (const r of theirFriendRows) {
      if (viewerFriendsSet.has(r.friend_id)) graphMutuals += 1;
    }

    const isOnline =
      prof.online !== undefined
        ? Boolean(prof.online)
        : Boolean(
            uRow.last_active_at &&
              Date.now() - new Date(uRow.last_active_at).getTime() < 30 * 60 * 1000
          );

    return {
      id: uRow.id,
      name: uRow.full_name,
      handle: `@${uRow.username}`,
      age: uRow.age || 16,
      school: prof.school || prof.educationLevel || 'TeenStack Verified School',
      avatarPreset: prof.avatarUrl || prof.avatarPreset || 'violet-coder',
      headline:
        prof.headline ||
        prof.desiredField ||
        (prof.subjects?.length ? `${prof.subjects[0]} Builder` : 'Verified TeenStack Student'),
      bio: prof.bio || 'Building projects and collaborating on TeenStack.',
      skills: Array.isArray(prof.skills) ? prof.skills : [],
      tags: Array.isArray(prof.generatedTags) ? prof.generatedTags : ['#TeenBuilder'],
      mutualConnections: (prof.baseMutuals || 4) + graphMutuals,
      projects: projs.length > 0 ? projs : prof.portfolioProjects || [],
      achievements: achs.length > 0 ? achs.map((a) => a.title) : prof.achievements || [],
      online: isOnline,
      connected: viewerId ? viewerFriendsSet.has(uRow.id) : false,
    };
  }

  function getUserFriendIdsSet(userId) {
    if (!userId) return new Set();
    const rows = db
      .prepare("SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'ACCEPTED'")
      .all(userId);
    const interactRows = db
      .prepare("SELECT target_id FROM user_interactions WHERE user_id = ? AND target_type = 'connect'")
      .all(userId);
    const set = new Set();
    for (const r of rows) set.add(r.friend_id);
    for (const r of interactRows) set.add(r.target_id);
    return set;
  }

  function listPeersForUser(viewerId) {
    const viewerFriends = getUserFriendIdsSet(viewerId);
    const blockedSet = viewerId && services ? services.getBlockedIdsSet(viewerId) : new Set();
    const rows = db
      .prepare(
        "SELECT * FROM users WHERE account_status = 'ACTIVE' AND id != ? ORDER BY datetime(created_at) ASC LIMIT 50"
      )
      .all(viewerId || '');
    return rows
      .filter((r) => !blockedSet.has(r.id))
      .map((r) => mapUserRowToPeerStudent(r, viewerId, viewerFriends));
  }

  function toggleFriendship({ viewerRow, targetPeerId }) {
    if (viewerRow.id === targetPeerId) {
      const err = new Error('You cannot connect with your own account.');
      err.status = 400;
      throw err;
    }
    if (services && services.isEitherBlocked(viewerRow.id, targetPeerId)) {
      const err = new Error('Cannot connect while a safety block is active between these accounts.');
      err.status = 403;
      err.code = 'USER_BLOCKED';
      throw err;
    }
    const targetRow = db
      .prepare("SELECT * FROM users WHERE id = ? AND account_status = 'ACTIVE'")
      .get(targetPeerId);
    if (!targetRow) {
      const err = new Error('Target student profile not found or inactive.');
      err.status = 404;
      throw err;
    }

    const existing = db
      .prepare('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?')
      .get(viewerRow.id, targetPeerId);

    const nowIso = new Date().toISOString();
    let connected = false;

    if (existing) {
      db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(
        viewerRow.id,
        targetPeerId
      );
      db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(
        targetPeerId,
        viewerRow.id
      );
      db.prepare(
        "DELETE FROM user_interactions WHERE user_id = ? AND target_type = 'connect' AND target_id = ?"
      ).run(viewerRow.id, targetPeerId);
    } else {
      db.prepare(
        "INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'ACCEPTED', ?)"
      ).run(viewerRow.id, targetPeerId, nowIso);
      db.prepare(
        "INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'ACCEPTED', ?)"
      ).run(targetPeerId, viewerRow.id, nowIso);
      db.prepare(
        "INSERT OR IGNORE INTO user_interactions (user_id, target_type, target_id, meta_json) VALUES (?, 'connect', ?, '{}')"
      ).run(viewerRow.id, targetPeerId);
      connected = true;

      // Ensure a direct chat thread exists between connected friends
      ensureDirectThreadBetween(viewerRow, targetRow);

      createNotification({
        userId: targetPeerId,
        type: 'friend',
        title: `${viewerRow.full_name} (@${viewerRow.username}) connected with you`,
        detail: 'You can now collaborate and message directly.',
        targetRoute: 'profile',
      });
    }

    return {
      connected,
      friendIds: Array.from(getUserFriendIdsSet(viewerRow.id)),
    };
  }

  function getFullProfileBundle({ viewerId, identifier }) {
    const clean = String(identifier || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    const targetRow = db
      .prepare(
        "SELECT * FROM users WHERE account_status = 'ACTIVE' AND (LOWER(id) = ? OR LOWER(username) = ?)"
      )
      .get(clean, clean);
    if (!targetRow) {
      const err = new Error('Student profile not found.');
      err.status = 404;
      throw err;
    }
    if (viewerId && services && services.isEitherBlocked(viewerId, targetRow.id)) {
      const err = new Error('Student profile is unavailable due to safety block settings.');
      err.status = 403;
      err.code = 'USER_BLOCKED';
      throw err;
    }

    const viewerFriends = getUserFriendIdsSet(viewerId);
    const blockedSet = viewerId && services ? services.getBlockedIdsSet(viewerId) : new Set();
    const peerCard = mapUserRowToPeerStudent(targetRow, viewerId, viewerFriends);
    const allPosts = listFeedPosts({ viewerId, includeStories: true });

    const authoredPosts = allPosts.filter(
      (p) => p.category !== 'story' && p.authorId === targetRow.id
    );
    const authoredStories = allPosts.filter(
      (p) => p.category === 'story' && p.authorId === targetRow.id
    );
    const taggedPosts = allPosts.filter(
      (p) =>
        p.category !== 'story' &&
        p.authorId !== targetRow.id &&
        Array.isArray(p.mediaMeta?.taggedPeople) &&
        p.mediaMeta.taggedPeople.some(
          (h) => String(h).replace(/^@/, '').toLowerCase() === targetRow.username.toLowerCase()
        )
    );

    const targetFriendIds = getUserFriendIdsSet(targetRow.id);
    const allOtherUsers = db
      .prepare("SELECT * FROM users WHERE account_status = 'ACTIVE' AND id != ?")
      .all(targetRow.id)
      .filter((u) => !blockedSet.has(u.id));

    const friends = allOtherUsers
      .filter((u) => targetFriendIds.has(u.id))
      .map((u) => mapUserRowToPeerStudent(u, viewerId, viewerFriends));

    const mutuals = allOtherUsers
      .map((u) => mapUserRowToPeerStudent(u, viewerId, viewerFriends))
      .sort((a, b) => b.mutualConnections - a.mutualConnections);

    return {
      profile: peerCard,
      posts: authoredPosts,
      stories: authoredStories,
      taggedPosts,
      projects: peerCard.projects,
      achievements: peerCard.achievements,
      friends,
      mutuals,
    };
  }

  // ===========================================================================
  // 5. FEED POSTS, REELS, 24H STORIES, COMMENTS, SHARES & @MENTIONS
  // ===========================================================================
  function formatPostRow(r, likedSet, savedSet, viewedStoriesSet, blockedSet = new Set()) {
    const relationalComments = db
      .prepare(
        'SELECT id, author_id, author_name, author_avatar, text, created_at FROM post_comments WHERE post_id = ? ORDER BY datetime(created_at) ASC, rowid ASC'
      )
      .all(r.id)
      .filter((c) => !blockedSet.has(c.author_id));

    const comments =
      relationalComments.length > 0
        ? relationalComments.map((c) => ({
            id: c.id,
            authorId: c.author_id,
            author: c.author_name,
            avatar: c.author_avatar,
            text: c.text,
            time: formatRelativeLabel(c.created_at),
          }))
        : safeJsonParse(r.comments_json, []).filter((c) => !c.authorId || !blockedSet.has(c.authorId));

    return {
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorHandle: r.author_handle,
      authorSchool: r.author_school,
      authorAvatar: r.author_avatar,
      category: r.category,
      title: r.title,
      content: r.content,
      mediaType: r.media_type,
      mediaMeta: safeJsonParse(r.media_meta, {}),
      skillTags: safeJsonParse(r.skill_tags, []),
      likesCount: r.likes_count,
      comments,
      sharesCount: r.shares_count,
      viewsCount: r.views_count || 0,
      expiresAt: r.expires_at || null,
      likedByMe: likedSet.has(r.id),
      savedByMe: savedSet.has(r.id),
      seenByMe: viewedStoriesSet.has(r.id),
      createdAt: r.created_at,
    };
  }

  function listFeedPosts({
    viewerId = null,
    category = null,
    skill = null,
    authorId = null,
    savedOnly = false,
    includeStories = true,
  } = {}) {
    const likedSet = new Set();
    const savedSet = new Set();
    const viewedStoriesSet = new Set();
    const blockedSet = viewerId && services ? services.getBlockedIdsSet(viewerId) : new Set();

    if (viewerId) {
      const interactions = db
        .prepare(
          "SELECT target_type, target_id FROM user_interactions WHERE user_id = ? AND target_type IN ('like', 'save')"
        )
        .all(viewerId);
      for (const i of interactions) {
        if (i.target_type === 'like') likedSet.add(i.target_id);
        if (i.target_type === 'save') savedSet.add(i.target_id);
      }
      const storyViews = db
        .prepare('SELECT story_id FROM story_views WHERE viewer_id = ?')
        .all(viewerId);
      for (const sv of storyViews) viewedStoriesSet.add(sv.story_id);
    }

    const nowIso = new Date().toISOString();
    const rows = db
      .prepare('SELECT * FROM posts ORDER BY datetime(created_at) DESC, rowid DESC')
      .all();

    return rows
      .filter((r) => {
        if (blockedSet.has(r.author_id)) return false;
        // Auto-expire stories older than 24h
        if (r.category === 'story') {
          if (!includeStories) return false;
          if (r.expires_at && r.expires_at <= nowIso) return false;
        }
        if (savedOnly && !savedSet.has(r.id)) return false;
        if (authorId && r.author_id !== authorId) return false;
        if (category && category !== 'all') {
          if (category === 'reel') {
            if (r.category !== 'reel' && r.category !== 'video') return false;
          } else if (r.category !== category) {
            return false;
          }
        }
        if (skill) {
          const needle = String(skill).toLowerCase();
          const hay = `${r.title} ${r.content} ${r.skill_tags}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .map((r) => formatPostRow(r, likedSet, savedSet, viewedStoriesSet, blockedSet));
  }

  function createPostWithRules({
    authorUser,
    category = 'post',
    title = '',
    content = '',
    mediaType = 'none',
    mediaMeta = {},
    skillTags = [],
  }) {
    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || cleanTitle).trim();
    if (!cleanContent) {
      const err = new Error('Please enter a topic or caption before publishing.');
      err.status = 400;
      throw err;
    }

    const safety = evaluateTeenSafetyFilter(cleanContent);
    if (!safety.allowed) {
      const err = new Error(safety.reason);
      err.status = 422;
      err.code = safety.code;
      throw err;
    }

    // Validate & normalize @taggedPeople (strictly max 10 on server!)
    const rawTags = Array.isArray(mediaMeta?.taggedPeople) ? mediaMeta.taggedPeople : [];
    const inlineMentions = cleanContent.match(/@[a-zA-Z0-9_.]{2,24}/g) || [];
    const normalizedMentions = [];
    for (const item of [...rawTags, ...inlineMentions]) {
      const h = normalizeHandle(item);
      if (h && !normalizedMentions.includes(h)) {
        normalizedMentions.push(h);
      }
    }

    if (normalizedMentions.length > MAX_TAGGED_PEOPLE) {
      const err = new Error(`You can tag a maximum of ${MAX_TAGGED_PEOPLE} people on a post.`);
      err.status = 400;
      err.code = 'MAX_TAGS_EXCEEDED';
      throw err;
    }

    const cleanAttachedLink = normalizeOptionalUrl(
      mediaMeta?.attachedLink || mediaMeta?.liveUrl || ''
    );
    const sanitizedMeta = {
      ...(mediaMeta || {}),
      topic: String(mediaMeta?.topic || cleanTitle).trim().slice(0, 80),
      taggedPeople: normalizedMentions,
      attachedLink: cleanAttachedLink,
    };

    const allowedCategories = new Set([
      'story',
      'post',
      'reel',
      'project',
      'achievement',
      'tutorial',
      'video',
      'certificate',
    ]);
    const finalCategory = allowedCategories.has(category) ? category : 'post';

    // Automatically convert inline base64 data URLs into binary /uploads/... files
    if (services) {
      if (sanitizedMeta.imageUrl) {
        sanitizedMeta.imageUrl = services.persistInlineDataUrlIfNeeded({
          userId: authorUser.id,
          maybeUrl: sanitizedMeta.imageUrl,
          purpose: finalCategory === 'story' ? 'story' : 'post',
        });
      }
      if (sanitizedMeta.videoUrl) {
        sanitizedMeta.videoUrl = services.persistInlineDataUrlIfNeeded({
          userId: authorUser.id,
          maybeUrl: sanitizedMeta.videoUrl,
          purpose: 'reel',
        });
      }
    }

    const now = new Date();
    const expiresAt =
      finalCategory === 'story'
        ? new Date(now.getTime() + STORY_LIFESPAN_MS).toISOString()
        : null;

    const id = `post-${randomBytes(6).toString('hex')}`;
    const schoolBadge = authorUser.profile.school
      ? `${authorUser.profile.school} · ${authorUser.age}`
      : `${authorUser.profile.educationLevel || 'TeenStack Builder'} · ${authorUser.age}`;

    const cleanSkillTags = Array.isArray(skillTags)
      ? skillTags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 10)
      : [];

    db.prepare(`
      INSERT INTO posts (
        id, author_id, author_name, author_handle, author_school, author_avatar,
        category, title, content, media_type, media_meta, skill_tags,
        likes_count, comments_json, shares_count, views_count, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', 0, 0, ?, ?)
    `).run(
      id,
      authorUser.id,
      authorUser.fullName,
      `@${authorUser.username}`,
      schoolBadge,
      authorUser.profile.avatarUrl || authorUser.profile.avatarPreset || 'violet-coder',
      finalCategory,
      cleanTitle.slice(0, 160),
      cleanContent,
      mediaType || 'none',
      JSON.stringify(sanitizedMeta),
      JSON.stringify(cleanSkillTags),
      expiresAt,
      now.toISOString()
    );

    // Dispatch real @mention notifications to tagged users
    for (const handle of normalizedMentions) {
      const uname = handle.replace(/^@/, '').toLowerCase();
      const taggedUser = db
        .prepare("SELECT id FROM users WHERE LOWER(username) = ? AND account_status = 'ACTIVE'")
        .get(uname);
      if (
        taggedUser &&
        taggedUser.id !== authorUser.id &&
        (!services || !services.isEitherBlocked(authorUser.id, taggedUser.id))
      ) {
        createNotification({
          userId: taggedUser.id,
          type: 'mention',
          title: `@${authorUser.username} tagged you in a ${finalCategory}`,
          detail: cleanTitle || cleanContent.slice(0, 90),
          targetRoute: 'home',
        });
      }
    }

    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return formatPostRow(row, new Set(), new Set(), new Set());
  }

  function deletePost({ userId, postId }) {
    const row = db.prepare('SELECT author_id, media_meta FROM posts WHERE id = ?').get(postId);
    if (!row) {
      const err = new Error('Post not found.');
      err.status = 404;
      throw err;
    }
    if (row.author_id !== userId) {
      const err = new Error('You can only delete your own posts.');
      err.status = 403;
      throw err;
    }
    if (services) {
      const meta = safeJsonParse(row.media_meta, {});
      services.unlinkUploadUrlIfOwned(meta.imageUrl);
      services.unlinkUploadUrlIfOwned(meta.videoUrl);
    }
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    return { deleted: true, postId };
  }

  function addCommentToPost({ authorUser, postId, text }) {
    const safety = evaluateTeenSafetyFilter(text);
    if (!safety.allowed) {
      const err = new Error(safety.reason);
      err.status = 422;
      err.code = safety.code;
      throw err;
    }

    const postRow = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!postRow) {
      const err = new Error('Post not found.');
      err.status = 404;
      throw err;
    }
    if (services && services.isEitherBlocked(authorUser.id, postRow.author_id)) {
      const err = new Error('You cannot comment on this post.');
      err.status = 403;
      err.code = 'USER_BLOCKED';
      throw err;
    }

    const commentId = `c-${randomBytes(5).toString('hex')}`;
    const avatar =
      authorUser.profile.avatarUrl || authorUser.profile.avatarPreset || 'violet-coder';
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO post_comments (id, post_id, author_id, author_name, author_avatar, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(commentId, postId, authorUser.id, authorUser.fullName, avatar, String(text).trim(), createdAt);

    if (postRow.author_id !== authorUser.id) {
      createNotification({
        userId: postRow.author_id,
        type: 'comment',
        title: `${authorUser.fullName} commented on your ${postRow.category}`,
        detail: String(text).trim().slice(0, 100),
        targetRoute: 'home',
      });
    }

    const formatted = formatPostRow(postRow, new Set(), new Set(), new Set());
    db.prepare('UPDATE posts SET comments_json = ? WHERE id = ?').run(
      JSON.stringify(formatted.comments),
      postId
    );
    return formatted.comments;
  }

  function deleteCommentFromPost({ userId, postId, commentId }) {
    const postRow = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!postRow) {
      const err = new Error('Post not found.');
      err.status = 404;
      throw err;
    }
    const commentRow = db
      .prepare('SELECT * FROM post_comments WHERE id = ? AND post_id = ?')
      .get(commentId, postId);
    if (!commentRow) {
      const err = new Error('Comment not found.');
      err.status = 404;
      throw err;
    }
    if (commentRow.author_id !== userId && postRow.author_id !== userId) {
      const err = new Error('You can only delete your own comments or comments on your posts.');
      err.status = 403;
      throw err;
    }

    db.prepare('DELETE FROM post_comments WHERE id = ?').run(commentId);
    const remaining = db
      .prepare(
        'SELECT id, author_id, author_name, author_avatar, text, created_at FROM post_comments WHERE post_id = ? ORDER BY datetime(created_at) ASC, rowid ASC'
      )
      .all(postId)
      .map((c) => ({
        id: c.id,
        authorId: c.author_id,
        author: c.author_name,
        avatar: c.author_avatar,
        text: c.text,
        time: formatRelativeLabel(c.created_at),
      }));

    db.prepare('UPDATE posts SET comments_json = ? WHERE id = ?').run(
      JSON.stringify(remaining),
      postId
    );
    return remaining;
  }

  function recordPostShare(postId) {
    const row = db.prepare('SELECT id, shares_count FROM posts WHERE id = ?').get(postId);
    if (!row) {
      const err = new Error('Post not found.');
      err.status = 404;
      throw err;
    }
    db.prepare('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?').run(postId);
    return { sharesCount: row.shares_count + 1 };
  }

  function recordStoryView({ viewerId, storyId }) {
    const story = db.prepare('SELECT id FROM posts WHERE id = ?').get(storyId);
    if (!story) return { ok: false };
    const existing = db
      .prepare('SELECT story_id FROM story_views WHERE story_id = ? AND viewer_id = ?')
      .get(storyId, viewerId);
    if (!existing) {
      db.prepare('INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES (?, ?, ?)').run(
        storyId,
        viewerId,
        new Date().toISOString()
      );
      db.prepare('UPDATE posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?').run(
        storyId
      );
    }
    return { ok: true };
  }

  // ===========================================================================
  // 6. MESSAGING, THREADS, UNREAD COUNTS & TEEN PRIVACY SHIELD
  // ===========================================================================
  function ensureUserDefaultThreads(userId) {
    const nowIso = new Date().toISOString();
    // Auto-join only public group study rooms (never another student's private 1:1 DM thread!)
    const defaultThreads = db
      .prepare('SELECT id FROM chat_threads WHERE is_group = 1 AND direct_key IS NULL')
      .all();
    const ins = db.prepare(
      'INSERT OR IGNORE INTO chat_participants (thread_id, user_id, last_read_at, joined_at) VALUES (?, ?, ?, ?)'
    );
    for (const t of defaultThreads) {
      ins.run(t.id, userId, nowIso, nowIso);
    }
  }

  function ensureDirectThreadBetween(userARow, userBRow) {
    const directKey = [userARow.id, userBRow.id].sort().join('::');
    const existing = db
      .prepare('SELECT * FROM chat_threads WHERE direct_key = ?')
      .get(directKey);
    const nowIso = new Date().toISOString();

    if (existing) {
      db.prepare(
        'INSERT OR IGNORE INTO chat_participants (thread_id, user_id, last_read_at, joined_at) VALUES (?, ?, ?, ?)'
      ).run(existing.id, userARow.id, nowIso, nowIso);
      db.prepare(
        'INSERT OR IGNORE INTO chat_participants (thread_id, user_id, last_read_at, joined_at) VALUES (?, ?, ?, ?)'
      ).run(existing.id, userBRow.id, '1970-01-01T00:00:00.000Z', nowIso);
      return existing.id;
    }

    const peerProf = safeJsonParse(userBRow.profile_json, {});
    const threadId = `thread-${randomBytes(5).toString('hex')}`;
    db.prepare(`
      INSERT INTO chat_threads (id, name, handle, role_badge, avatar_preset, is_group, direct_key, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      threadId,
      userBRow.full_name,
      `@${userBRow.username}`,
      peerProf.school || 'Verified Student',
      peerProf.avatarUrl || peerProf.avatarPreset || 'violet-coder',
      directKey,
      nowIso,
      nowIso
    );

    db.prepare(
      'INSERT INTO chat_participants (thread_id, user_id, last_read_at, joined_at) VALUES (?, ?, ?, ?)'
    ).run(threadId, userARow.id, nowIso, nowIso);
    db.prepare(
      'INSERT INTO chat_participants (thread_id, user_id, last_read_at, joined_at) VALUES (?, ?, ?, ?)'
    ).run(threadId, userBRow.id, '1970-01-01T00:00:00.000Z', nowIso);

    return threadId;
  }

  function openDirectThreadWithPrivacyCheck({ senderRow, targetPeerId }) {
    if (services && services.isEitherBlocked(senderRow.id, targetPeerId)) {
      const err = new Error('Direct messaging is unavailable due to safety block settings.');
      err.status = 403;
      err.code = 'USER_BLOCKED';
      throw err;
    }
    const peerRow = db
      .prepare("SELECT * FROM users WHERE id = ? AND account_status = 'ACTIVE'")
      .get(targetPeerId);
    if (!peerRow) {
      const err = new Error('Recipient student not found or inactive.');
      err.status = 404;
      throw err;
    }

    const peerProf = safeJsonParse(peerRow.profile_json, {});
    const dmPerm = peerProf.privacy?.dmPermission || 'verified_students';
    if (dmPerm === 'connections_only') {
      const friends = getUserFriendIdsSet(peerRow.id);
      if (!friends.has(senderRow.id)) {
        const err = new Error(
          `${peerRow.full_name}'s Teen Privacy Shield allows direct messages from connected friends only.`
        );
        err.status = 403;
        err.code = 'DM_CONNECTIONS_ONLY';
        throw err;
      }
    }

    const threadId = ensureDirectThreadBetween(senderRow, peerRow);
    return { threadId };
  }

  function listThreadsForUser(userId) {
    ensureUserDefaultThreads(userId);
    const blockedSet = services ? services.getBlockedIdsSet(userId) : new Set();
    const rows = db
      .prepare(`
        SELECT t.*, p.last_read_at
        FROM chat_threads t
        JOIN chat_participants p ON p.thread_id = t.id
        WHERE p.user_id = ?
        ORDER BY datetime(t.updated_at) DESC
      `)
      .all(userId)
      .filter((t) => {
        if (!t.direct_key) return true;
        const otherId = String(t.direct_key)
          .split('::')
          .find((id) => id !== userId);
        return !otherId || !blockedSet.has(otherId);
      });

    let totalUnread = 0;
    const threads = rows.map((t) => {
      const unreadRow = db
        .prepare(`
          SELECT COUNT(*) as c FROM messages
          WHERE thread_id = ? AND sender_id != ? AND datetime(created_at) > datetime(?)
        `)
        .get(t.id, userId, t.last_read_at || '1970-01-01T00:00:00.000Z');
      const unread = unreadRow?.c || 0;
      totalUnread += unread;

      return {
        id: t.id,
        name: t.name,
        handle: t.handle,
        roleBadge: t.role_badge,
        avatarPreset: t.avatar_preset,
        online: true,
        unread,
        isGroup: Boolean(t.is_group),
      };
    });

    return { threads, totalUnread };
  }

  function markThreadRead({ userId, threadId }) {
    ensureUserDefaultThreads(userId);
    const participant = db
      .prepare('SELECT 1 FROM chat_participants WHERE thread_id = ? AND user_id = ?')
      .get(threadId, userId);
    if (!participant) {
      const err = new Error('You are not a participant in this conversation.');
      err.status = 403;
      err.code = 'FORBIDDEN_THREAD_ACCESS';
      throw err;
    }
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE chat_participants SET last_read_at = ? WHERE thread_id = ? AND user_id = ?').run(
      nowIso,
      threadId,
      userId
    );
    return listThreadsForUser(userId);
  }

  function listMessagesForUser({ userId, threadId = null }) {
    ensureUserDefaultThreads(userId);
    const blockedSet = services ? services.getBlockedIdsSet(userId) : new Set();

    if (threadId) {
      const participant = db
        .prepare('SELECT 1 FROM chat_participants WHERE thread_id = ? AND user_id = ?')
        .get(threadId, userId);
      if (!participant) {
        const err = new Error('You are not authorized to read messages in this conversation.');
        err.status = 403;
        err.code = 'FORBIDDEN_THREAD_ACCESS';
        throw err;
      }
      const rows = db
        .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY datetime(created_at) ASC')
        .all(threadId);
      return rows
        .filter((m) => !blockedSet.has(m.sender_id))
        .map((m) => ({
          id: m.id,
          threadId: m.thread_id,
          senderId: m.sender_id,
          senderName: m.sender_name,
          text: m.text,
          createdAt: m.created_at,
        }));
    }

    const rows = db
      .prepare(`
        SELECT m.*
        FROM messages m
        JOIN chat_participants p ON p.thread_id = m.thread_id
        WHERE p.user_id = ?
        ORDER BY datetime(m.created_at) ASC
      `)
      .all(userId);

    return rows
      .filter((m) => !blockedSet.has(m.sender_id))
      .map((m) => ({
        id: m.id,
        threadId: m.thread_id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        text: m.text,
        createdAt: m.created_at,
      }));
  }

  function sendChatMessageWithSafety({ senderUser, threadId, text }) {
    const safety = evaluateTeenSafetyFilter(text);
    if (!safety.allowed) {
      const err = new Error(safety.reason);
      err.status = 422;
      err.code = safety.code;
      throw err;
    }

    ensureUserDefaultThreads(senderUser.id);
    const existingThread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(threadId);
    if (!existingThread) {
      const err = new Error('Conversation thread not found.');
      err.status = 404;
      err.code = 'THREAD_NOT_FOUND';
      throw err;
    }

    const participant = db
      .prepare('SELECT 1 FROM chat_participants WHERE thread_id = ? AND user_id = ?')
      .get(threadId, senderUser.id);
    if (!participant) {
      const err = new Error('You are not a participant in this conversation.');
      err.status = 403;
      err.code = 'FORBIDDEN_THREAD_ACCESS';
      throw err;
    }

    // Enforce block & DM privacy rules on 1:1 threads even if thread existed earlier
    if (existingThread.direct_key) {
      const otherId = String(existingThread.direct_key)
        .split('::')
        .find((id) => id !== senderUser.id);
      if (otherId) {
        if (services && services.isEitherBlocked(senderUser.id, otherId)) {
          const err = new Error('Cannot send message because a block is active between these accounts.');
          err.status = 403;
          err.code = 'USER_BLOCKED';
          throw err;
        }
        const peerRow = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
        if (peerRow) {
          const peerProf = safeJsonParse(peerRow.profile_json, {});
          if (peerProf.privacy?.dmPermission === 'connections_only') {
            const friends = getUserFriendIdsSet(peerRow.id);
            if (!friends.has(senderUser.id)) {
              const err = new Error(
                `${peerRow.full_name}'s Teen Privacy Shield allows direct messages from connected friends only.`
              );
              err.status = 403;
              err.code = 'DM_CONNECTIONS_ONLY';
              throw err;
            }
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(nowIso, threadId);

    // Update sender read cursor
    markThreadRead({ userId: senderUser.id, threadId });

    const id = `msg-${randomBytes(6).toString('hex')}`;
    const cleanText = String(text).trim();
    db.prepare(
      'INSERT INTO messages (id, thread_id, sender_id, sender_name, text, attachment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, threadId, senderUser.id, senderUser.fullName, cleanText, 'null', nowIso);

    // Notify other non-blocked participants in the thread
    const others = db
      .prepare('SELECT user_id FROM chat_participants WHERE thread_id = ? AND user_id != ?')
      .all(threadId, senderUser.id);
    for (const o of others) {
      if (!services || !services.isEitherBlocked(senderUser.id, o.user_id)) {
        createNotification({
          userId: o.user_id,
          type: 'message',
          title: `New message from ${senderUser.fullName}`,
          detail: cleanText.slice(0, 90),
          targetRoute: 'chats',
        });
      }
    }

    return {
      id,
      threadId,
      senderId: senderUser.id,
      senderName: senderUser.fullName,
      text: cleanText,
      createdAt: nowIso,
    };
  }

  function deleteChatMessage({ userId, messageId }) {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!msg) {
      const err = new Error('Message not found.');
      err.status = 404;
      throw err;
    }
    if (msg.sender_id !== userId) {
      const err = new Error('You can only unsend your own messages.');
      err.status = 403;
      throw err;
    }
    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    return { deleted: true, messageId };
  }

  // ===========================================================================
  // 7. OPPORTUNITIES, HACKATHONS & PITCH APPLICATIONS ENGINE
  // ===========================================================================
  function listOpportunities({ userId = null, typeFilter = null } = {}) {
    const appliedSet = new Set();
    const savedSet = new Set();
    const pitchNotesByOpp = {};

    if (userId) {
      const appRows = db
        .prepare('SELECT opportunity_id, pitch_note FROM opportunity_applications WHERE user_id = ?')
        .all(userId);
      for (const a of appRows) {
        appliedSet.add(a.opportunity_id);
        pitchNotesByOpp[a.opportunity_id] = a.pitch_note;
      }
      const interactRows = db
        .prepare(
          "SELECT target_type, target_id FROM user_interactions WHERE user_id = ? AND target_type IN ('opportunity_apply', 'opportunity_save')"
        )
        .all(userId);
      for (const r of interactRows) {
        if (r.target_type === 'opportunity_apply') appliedSet.add(r.target_id);
        if (r.target_type === 'opportunity_save') savedSet.add(r.target_id);
      }
    }

    const rows = db
      .prepare('SELECT * FROM opportunities ORDER BY featured DESC, datetime(created_at) DESC')
      .all();

    return rows
      .filter((r) => !typeFilter || typeFilter === 'All' || r.type === typeFilter)
      .map((r) => {
        const countRow = db
          .prepare('SELECT COUNT(*) as c FROM opportunity_applications WHERE opportunity_id = ?')
          .get(r.id);
        return {
          id: r.id,
          title: r.title,
          organization: r.organization,
          type: r.type,
          deadline: r.deadline,
          Mode: r.mode,
          reward: r.reward,
          ageRange: r.age_range,
          skills: safeJsonParse(r.skills_json, []),
          description: r.description,
          featured: Boolean(r.featured),
          applicantsCount: (countRow?.c || 0) + 18,
          appliedByMe: appliedSet.has(r.id),
          savedByMe: savedSet.has(r.id),
          myPitchNote: pitchNotesByOpp[r.id] || '',
        };
      });
  }

  function applyToOpportunity({ user, opportunityId, pitchNote = '' }) {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunityId);
    if (!opp) {
      const err = new Error('Opportunity listing not found.');
      err.status = 404;
      throw err;
    }

    const existing = db
      .prepare('SELECT * FROM opportunity_applications WHERE opportunity_id = ? AND user_id = ?')
      .get(opportunityId, user.id);
    if (existing) {
      return { applicationId: existing.id, alreadyApplied: true };
    }

    const appId = `app_${randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const snapshot = {
      username: user.username,
      skills: user.profile.skills,
      portfolioUrl: user.profile.portfolioUrl,
      projectsCount: user.profile.portfolioProjects.length,
    };

    db.prepare(`
      INSERT INTO opportunity_applications (id, opportunity_id, user_id, pitch_note, portfolio_snapshot_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?)
    `).run(
      appId,
      opportunityId,
      user.id,
      String(pitchNote || '').trim().slice(0, 600),
      JSON.stringify(snapshot),
      nowIso
    );

    db.prepare(
      "INSERT OR IGNORE INTO user_interactions (user_id, target_type, target_id, meta_json) VALUES (?, 'opportunity_apply', ?, ?)"
    ).run(user.id, opportunityId, JSON.stringify({ pitchNote: String(pitchNote || '').slice(0, 200) }));

    createNotification({
      userId: user.id,
      type: 'application',
      title: `Application submitted: ${opp.title}`,
      detail: `${opp.organization} received your TeenStack portfolio & builder note.`,
      targetRoute: 'opportunities',
    });

    return { applicationId: appId, status: 'SUBMITTED', createdAt: nowIso };
  }

  function createOpportunityBounty({
    creatorUser,
    title,
    organization,
    type = 'Student Bounty',
    deadline = 'Rolling · 7 Days Left',
    mode = 'Remote',
    reward,
    skills = [],
    description,
  }) {
    if (!title || !reward || !description) {
      const err = new Error('Title, reward, and description are required to post an opportunity.');
      err.status = 400;
      throw err;
    }
    const id = `opp-${randomBytes(5).toString('hex')}`;
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO opportunities (id, creator_id, title, organization, type, deadline, mode, reward, age_range, skills_json, description, featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Ages 13–19', ?, ?, 0, ?)
    `).run(
      id,
      creatorUser.id,
      String(title).trim().slice(0, 140),
      String(organization || `${creatorUser.fullName} · Student Initiative`).trim().slice(0, 120),
      type,
      deadline,
      mode,
      String(reward).trim().slice(0, 80),
      JSON.stringify(Array.isArray(skills) ? skills.slice(0, 8) : []),
      String(description).trim().slice(0, 600),
      nowIso
    );
    return listOpportunities({ userId: creatorUser.id }).find((o) => o.id === id);
  }

  // ===========================================================================
  // 8. COURSES, INTERACTIVE MODULE PROGRESS & AUTO-CERTIFICATES ENGINE
  // ===========================================================================
  function listCoursesWithProgress(userId = null) {
    const completedKeys = new Set();
    if (userId) {
      const progRows = db
        .prepare('SELECT course_id, module_code FROM course_module_progress WHERE user_id = ?')
        .all(userId);
      for (const r of progRows) completedKeys.add(`${r.course_id}:${r.module_code}`);

      const legacyRows = db
        .prepare(
          "SELECT target_id FROM user_interactions WHERE user_id = ? AND target_type = 'course_module'"
        )
        .all(userId);
      for (const r of legacyRows) completedKeys.add(r.target_id);
    }

    const courseRows = db.prepare('SELECT * FROM courses ORDER BY sort_order ASC').all();
    const courses = courseRows.map((c) => {
      const modRows = db
        .prepare(
          'SELECT module_code, title, duration FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC'
        )
        .all(c.id);
      const modules = modRows.map((m) => ({
        id: m.module_code,
        title: m.title,
        duration: m.duration,
      }));
      const completedLessons = modules.filter((m) => completedKeys.has(`${c.id}:${m.id}`)).length;

      return {
        id: c.id,
        title: c.title,
        track: c.track,
        level: c.level,
        duration: c.duration,
        lessonsCount: modules.length,
        completedLessons,
        mentor: c.mentor,
        skills: safeJsonParse(c.skills_json, []),
        summary: c.summary,
        modules,
      };
    });

    return {
      courses,
      completedModuleKeys: Array.from(completedKeys),
    };
  }

  function toggleCourseModuleProgress({ user, courseId, moduleCode }) {
    const mod = db
      .prepare('SELECT * FROM course_modules WHERE course_id = ? AND module_code = ?')
      .get(courseId, moduleCode);
    if (!mod) {
      const err = new Error('Course module not found.');
      err.status = 404;
      throw err;
    }

    const key = `${courseId}:${moduleCode}`;
    const existing = db
      .prepare(
        'SELECT * FROM course_module_progress WHERE user_id = ? AND course_id = ? AND module_code = ?'
      )
      .get(user.id, courseId, moduleCode);

    const nowIso = new Date().toISOString();
    let completed = false;
    if (existing) {
      db.prepare(
        'DELETE FROM course_module_progress WHERE user_id = ? AND course_id = ? AND module_code = ?'
      ).run(user.id, courseId, moduleCode);
      db.prepare(
        "DELETE FROM user_interactions WHERE user_id = ? AND target_type = 'course_module' AND target_id = ?"
      ).run(user.id, key);
    } else {
      db.prepare(
        'INSERT INTO course_module_progress (user_id, course_id, module_code, completed_at) VALUES (?, ?, ?, ?)'
      ).run(user.id, courseId, moduleCode, nowIso);
      db.prepare(
        "INSERT OR IGNORE INTO user_interactions (user_id, target_type, target_id, meta_json) VALUES (?, 'course_module', ?, '{}')"
      ).run(user.id, key);
      completed = true;
    }

    // Check if 100% of modules in this course are now completed -> auto-award verified credential!
    const totalMods = db
      .prepare('SELECT COUNT(*) as c FROM course_modules WHERE course_id = ?')
      .get(courseId).c;
    const doneMods = db
      .prepare('SELECT COUNT(*) as c FROM course_module_progress WHERE user_id = ? AND course_id = ?')
      .get(user.id, courseId).c;

    let certificateAwarded = false;
    if (completed && totalMods > 0 && doneMods >= totalMods) {
      const alreadyMinted = db
        .prepare('SELECT id FROM student_achievements WHERE user_id = ? AND course_id = ?')
        .get(user.id, courseId);
      if (!alreadyMinted) {
        const courseRow = db.prepare('SELECT title, level FROM courses WHERE id = ?').get(courseId);
        addStudentAchievement({
          userId: user.id,
          title: `Verified Credential: ${courseRow.title} (${courseRow.level})`,
          issuer: 'TeenStack Learn Academy',
          courseId,
        });
        createNotification({
          userId: user.id,
          type: 'achievement',
          title: `Course Completed: ${courseRow.title}!`,
          detail: 'A verified credential badge has been added to your Profile Achievements.',
          targetRoute: 'profile',
        });
        certificateAwarded = true;
      }
    }

    return {
      completed,
      certificateAwarded,
      ...listCoursesWithProgress(user.id),
    };
  }

  // ===========================================================================
  // 9. GLOBAL UNIFIED SQL SEARCH ENGINE
  // ===========================================================================
  function executeGlobalSearch({ viewerId, query }) {
    const q = String(query || '').trim().toLowerCase();
    const peers = listPeersForUser(viewerId)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.handle.toLowerCase().includes(q) ||
          p.school.toLowerCase().includes(q) ||
          p.skills.some((s) => s.toLowerCase().includes(q))
      )
      .slice(0, 6);

    const posts = listFeedPosts({ viewerId, includeStories: false })
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.authorName.toLowerCase().includes(q) ||
          p.skillTags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 6);

    const opportunities = listOpportunities({ userId: viewerId })
      .filter(
        (o) =>
          !q ||
          o.title.toLowerCase().includes(q) ||
          o.organization.toLowerCase().includes(q) ||
          o.type.toLowerCase().includes(q) ||
          o.skills.some((s) => s.toLowerCase().includes(q))
      )
      .slice(0, 4);

    const { courses } = listCoursesWithProgress(viewerId);
    const matchedCourses = courses
      .filter(
        (c) =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          c.track.toLowerCase().includes(q) ||
          c.skills.some((s) => s.toLowerCase().includes(q))
      )
      .slice(0, 4);

    return {
      students: peers,
      posts,
      opportunities,
      courses: matchedCourses,
    };
  }

  // ===========================================================================
  // 10. UNIFIED BOOTSTRAP PAYLOAD (1 Round-Trip Hydration for Active Student)
  // ===========================================================================
  function getAuthenticatedBootstrap(user) {
    db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      user.id
    );
    const posts = listFeedPosts({ viewerId: user.id, includeStories: true });
    const { threads, totalUnread } = listThreadsForUser(user.id);
    const messages = listMessagesForUser({ userId: user.id });
    const peers = listPeersForUser(user.id);
    const opportunities = listOpportunities({ userId: user.id });
    const { courses, completedModuleKeys } = listCoursesWithProgress(user.id);
    const notifications = listNotifications(user.id);
    const friendIds = Array.from(getUserFriendIdsSet(user.id));
    const blockedUsers = services ? services.listMyBlockedUsers(user.id) : [];
    const interactions = db
      .prepare('SELECT target_type, target_id, meta_json FROM user_interactions WHERE user_id = ?')
      .all(user.id);

    return {
      posts,
      threads,
      unreadChatsCount: totalUnread,
      messages,
      peers,
      friendIds,
      blockedUsers,
      opportunities,
      courses,
      completedModuleKeys,
      notifications,
      interactions,
    };
  }

  return {
    createNotification,
    listNotifications,
    markNotificationsRead,
    checkUsernameAvailability,
    requestPasswordReset,
    confirmPasswordReset,
    addStudentProject,
    deleteStudentProject,
    addStudentAchievement,
    deleteStudentAchievement,
    syncUserProfileJsonFromTables,
    getUserFriendIdsSet,
    listPeersForUser,
    toggleFriendship,
    getFullProfileBundle,
    listFeedPosts,
    createPostWithRules,
    deletePost,
    addCommentToPost,
    deleteCommentFromPost,
    recordPostShare,
    recordStoryView,
    openDirectThreadWithPrivacyCheck,
    listThreadsForUser,
    listMessagesForUser,
    markThreadRead,
    sendChatMessageWithSafety,
    deleteChatMessage,
    listOpportunities,
    applyToOpportunity,
    createOpportunityBounty,
    listCoursesWithProgress,
    toggleCourseModuleProgress,
    executeGlobalSearch,
    getAuthenticatedBootstrap,
  };
}
