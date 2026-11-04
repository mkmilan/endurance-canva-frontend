import { exportLibrary, importLibrary, planLibraryRestore } from './library-backup.js';

const DB_NAME = 'endurance-canvas-studio';
let connection;

function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Browser storage is unavailable. Export your lesson to keep a copy.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('lessons', { keyPath: 'id' });
      db.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(new Error('Could not open browser storage. Export your lesson to keep a copy.')); };
    request.onblocked = () => reject(new Error('Another tab is blocking storage. Close other studio tabs and try again.'));
  });
  return connection;
}

export async function saveLocalLesson(lesson) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['lessons', 'settings'], 'readwrite');
    tx.objectStore('lessons').put(lesson);
    tx.objectStore('settings').put(lesson.id, 'activeLesson');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Could not save on this device. Export your lesson to keep a copy.'));
    tx.onabort = () => reject(new Error('Saving was interrupted. Your lesson is still open.'));
  });
}

export async function listLocalLessons() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('lessons').objectStore('lessons').getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
    request.onerror = () => reject(new Error('Could not read saved lessons.'));
  });
}

export async function loadActiveLesson() {
  const db = await database();
  const id = await new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get('activeLesson');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not restore the last lesson.'));
  });
  if (!id) return null;
  return new Promise((resolve, reject) => {
    const request = db.transaction('lessons').objectStore('lessons').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Could not restore the last lesson.'));
  });
}

export async function deleteLocalLesson(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('lessons', 'readwrite');
    tx.objectStore('lessons').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Could not delete this lesson.'));
  });
}

export async function exportLocalLibrary() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['lessons', 'settings'], 'readonly');
    const records = tx.objectStore('lessons').getAll();
    const active = tx.objectStore('settings').get('activeLesson');
    tx.oncomplete = () => {
      try { resolve(exportLibrary(records.result, active.result)); }
      catch (error) { reject(error); }
    };
    tx.onerror = () => reject(new Error('Could not read the complete library. Your lessons have not changed.'));
    tx.onabort = tx.onerror;
  });
}

export async function restoreLocalLibrary(backup) {
  // Validate the complete archive before opening a write transaction.
  importLibrary(backup);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['lessons', 'settings'], 'readwrite');
    const store = tx.objectStore('lessons');
    const existing = store.getAllKeys();
    let result;
    let restoreError;
    existing.onsuccess = () => {
      try {
        result = planLibraryRestore(backup, existing.result);
        // add() rather than put() makes replacement impossible even on a collision.
        for (const lesson of result.lessons) store.add(lesson);
        if (result.activeLessonId) tx.objectStore('settings').put(result.activeLessonId, 'activeLesson');
      } catch (error) { restoreError = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(restoreError || new Error('Could not restore this library. Your existing lessons are unchanged.'));
    tx.onabort = tx.onerror;
  });
}
