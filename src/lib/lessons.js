import example from '../generated/contracts/example.v1.json' with { type: 'json' };
import catalog from '../generated/contracts/catalog.v1.json' with { type: 'json' };
import { validateLesson } from '../generated/contracts/validation.js';

export { example, catalog };
export const copy = (value) => structuredClone(value);

export function createLesson(content = example) {
  const result = validateLesson(content);
  if (!result.valid) throw new Error(result.errors[0]);
  return { id: crypto.randomUUID(), revision: 1, content: copy(content), history: [], reviewedRevision: null, updatedAt: new Date().toISOString(), evidenceSnapshot: copy(catalog), conversation: [] };
}

export function reviseLesson(lesson, content) {
  const result = validateLesson(content);
  if (!result.valid) throw new Error(result.errors[0]);
  return { ...lesson, content: copy(content), revision: lesson.revision + 1, history: [...lesson.history, { content: copy(lesson.content), revision: lesson.revision }].slice(-12), reviewedRevision: null, updatedAt: new Date().toISOString() };
}

export function undoLesson(lesson) {
  if (!lesson.history.length) return lesson;
  const previous = lesson.history.at(-1);
  return { ...lesson, content: copy(previous.content), revision: lesson.revision + 1, history: lesson.history.slice(0, -1), reviewedRevision: null, updatedAt: new Date().toISOString() };
}

export function exportLesson(lesson) {
  return { format: 'endurance-canvas-lesson', exportVersion: 1, exportedAt: new Date().toISOString(), content: copy(lesson.content), evidenceSnapshot: copy(catalog) };
}

export function importLesson(value) {
  if (!value || value.format !== 'endurance-canvas-lesson' || value.exportVersion !== 1) throw new Error('This is not a supported Endurance Canvas lesson file.');
  const result = validateLesson(value.content);
  if (!result.valid) throw new Error(result.errors[0]);
  // Reconcile against our trusted version. Never render URLs or grant review
  // status from imported metadata, even if the file labels them as approved.
  const lesson = createLesson(value.content);
  return { lesson, sourceNotesReconciled: JSON.stringify(value.evidenceSnapshot) !== JSON.stringify(catalog) };
}

export function validStoredLesson(value) {
  return value && typeof value.id === 'string' && Number.isInteger(value.revision) && value.revision > 0 && validateLesson(value.content).valid && Array.isArray(value.history) && value.history.every((entry) => validateLesson(entry.content).valid);
}

export function filename(title, extension) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'endurance-canvas'}.${extension}`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
