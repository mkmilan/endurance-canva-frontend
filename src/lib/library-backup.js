import { catalog, copy } from './lessons.js';
import { validateLesson } from '../generated/contracts/validation.js';

export const LIBRARY_FORMAT = 'endurance-canvas-library';
export const MAX_LIBRARY_BYTES = 8_000_000;
export const MAX_LIBRARY_LESSONS = 250;

const RECORD_KEYS = ['id', 'revision', 'content', 'history', 'reviewedRevision', 'updatedAt', 'evidenceSnapshot', 'conversation'];
const BACKUP_KEYS = ['format', 'exportVersion', 'exportedAt', 'activeLessonId', 'lessons'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);
const validRevision = value => Number.isSafeInteger(value) && value > 0 && value < 1_000_000_000;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function invalid(message) { throw new Error(message); }

function checkSize(value) {
  let json;
  try { json = JSON.stringify(value); } catch { invalid('This library cannot be read as a JSON backup.'); }
  if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > MAX_LIBRARY_BYTES) {
    invalid('This library is too large. Choose a library backup under 8 MB, or export lessons individually.');
  }
}

function readConversation(value) {
  if (!Array.isArray(value) || value.length > 30) invalid('A saved conversation is invalid. A library can keep up to 30 messages per lesson.');
  return value.map(message => {
    if (!object(message) || Object.keys(message).some(key => !['role', 'text', 'generationMode', 'error'].includes(key)) ||
      !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 8000 || message.text.includes('\0') ||
      (Object.hasOwn(message, 'generationMode') && !['demo', 'live'].includes(message.generationMode)) ||
      (Object.hasOwn(message, 'error') && typeof message.error !== 'boolean')) {
      invalid('A saved conversation contains unsupported message data.');
    }
    // Conversation text remains a plain string. React renders it as text, never HTML.
    return { role: message.role, text: message.text,
      ...(Object.hasOwn(message, 'generationMode') ? { generationMode: message.generationMode } : {}),
      ...(Object.hasOwn(message, 'error') ? { error: message.error } : {}) };
  });
}

function readRecord(value, resetReview) {
  if (!exactKeys(value, RECORD_KEYS) || !validId(value.id) || !validRevision(value.revision) || !validDate(value.updatedAt)) {
    invalid('A saved lesson has unsupported identity, revision, or date information.');
  }
  const contentCheck = validateLesson(value.content);
  if (!contentCheck.valid) invalid(`A saved lesson is invalid: ${contentCheck.errors[0]}`);
  if (!Array.isArray(value.history) || value.history.length > 12) invalid('A saved lesson has invalid revision history.');
  let previousRevision = 0;
  const history = value.history.map(entry => {
    if (!exactKeys(entry, ['content', 'revision']) || !validRevision(entry.revision) || entry.revision <= previousRevision || entry.revision >= value.revision || !validateLesson(entry.content).valid) {
      invalid('A saved lesson has invalid revision history.');
    }
    previousRevision = entry.revision;
    return { content: copy(entry.content), revision: entry.revision };
  });
  if (value.reviewedRevision !== null && value.reviewedRevision !== value.revision) invalid('A saved lesson has an invalid review state.');
  if (!object(value.evidenceSnapshot)) invalid('A saved lesson is missing its evidence snapshot.');
  return {
    lesson: { id: value.id, revision: value.revision, content: copy(value.content), history,
      reviewedRevision: resetReview ? null : value.reviewedRevision, updatedAt: value.updatedAt,
      evidenceSnapshot: copy(catalog), conversation: readConversation(value.conversation) },
    sourceNotesReconciled: JSON.stringify(value.evidenceSnapshot) !== JSON.stringify(catalog),
  };
}

function readBackup(value, resetReview) {
  if (!exactKeys(value, BACKUP_KEYS) || value.format !== LIBRARY_FORMAT || value.exportVersion !== 1) {
    invalid('This is not a supported Endurance Canvas library backup.');
  }
  checkSize(value);
  if (!validDate(value.exportedAt) || !Array.isArray(value.lessons) || value.lessons.length > MAX_LIBRARY_LESSONS) {
    invalid(`This library backup is invalid. Choose a backup with no more than ${MAX_LIBRARY_LESSONS} lessons.`);
  }
  const ids = new Set();
  const results = value.lessons.map(entry => {
    const result = readRecord(entry, resetReview);
    if (ids.has(result.lesson.id)) invalid('This library backup contains duplicate lesson identifiers.');
    ids.add(result.lesson.id);
    return result;
  });
  if (value.activeLessonId !== null && (!validId(value.activeLessonId) || !ids.has(value.activeLessonId))) {
    invalid('The selected lesson is missing from this library backup.');
  }
  return { lessons: results.map(result => result.lesson), activeLessonId: value.activeLessonId,
    sourceNotesReconciled: results.some(result => result.sourceNotesReconciled) };
}

/** Complete portable archive; no account credentials or application settings are included. */
export function exportLibrary(lessons, activeLessonId, exportedAt = new Date().toISOString()) {
  const backup = { format: LIBRARY_FORMAT, exportVersion: 1, exportedAt, activeLessonId: activeLessonId ?? null, lessons };
  const checked = readBackup(backup, false);
  return { ...backup, lessons: checked.lessons };
}

/** All records are checked before any storage writes. Imported review flags are not trusted. */
export function importLibrary(value) {
  return readBackup(value, true);
}

/** Preserve originals; a colliding ID becomes a restored copy without replacing local work. */
export function planLibraryRestore(value, existingIds = [], createId = () => crypto.randomUUID()) {
  const checked = importLibrary(value);
  const occupied = new Set(existingIds);
  // Reserve incoming identifiers too, so a generated copy cannot steal a later record's ID.
  const reserved = new Set([...occupied, ...checked.lessons.map(lesson => lesson.id)]);
  const idMap = new Map();
  let conflictCount = 0;
  const lessons = checked.lessons.map(lesson => {
    let id = lesson.id;
    if (occupied.has(id)) {
      conflictCount++;
      let attempts = 0;
      do {
        if (attempts++ >= 20) invalid('Could not create a separate restored copy. Please try again.');
        id = createId();
      } while (!validId(id) || reserved.has(id));
    }
    occupied.add(id); reserved.add(id); idMap.set(lesson.id, id);
    return { ...lesson, id };
  });
  return { lessons, activeLessonId: idMap.get(checked.activeLessonId) ?? lessons[0]?.id ?? null,
    restoredCount: lessons.length, conflictCount, sourceNotesReconciled: checked.sourceNotesReconciled };
}
