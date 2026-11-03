import test from 'node:test';
import assert from 'node:assert/strict';
import { createLesson, reviseLesson, undoLesson, exportLesson, importLesson, validStoredLesson, catalog, copy, example } from '../src/lib/lessons.js';
import { classifyPower, validateLesson } from '../src/generated/contracts/validation.js';

test('the fixture and its evidence are valid', () => {
  assert.equal(validateLesson(example).valid,true);
  assert.equal(createLesson().evidenceSnapshot.catalogVersion,catalog.catalogVersion);
});

test('exact thresholds use the specified Zone 2 boundary convention', () => {
  assert.equal(classifyPower(179,180,240).zone,1);
  assert.deepEqual(classifyPower(180,180,240),{zone:2,label:'Zone 2',boundary:'At LT1'});
  assert.equal(classifyPower(200,180,240).zone,2);
  assert.deepEqual(classifyPower(240,180,240),{zone:2,label:'Zone 2',boundary:'At LT2'});
  assert.equal(classifyPower(241,180,240).zone,3);
});

test('revisions preserve the original and invalidate a review', () => {
  const original=createLesson();original.reviewedRevision=original.revision;
  const content=copy(original.content);content.title='A new explanation';
  const next=reviseLesson(original,content);
  assert.equal(original.content.title,example.title);
  assert.equal(next.history[0].content.title,example.title);
  assert.equal(next.reviewedRevision,null);
  assert.equal(next.revision,2);
});

test('undo restores content with a fresh unreviewed revision', () => {
  const original=createLesson();const next=reviseLesson(original,{...copy(original.content),title:'Changed'});
  const restored=undoLesson(next);
  assert.deepEqual(restored.content,original.content);
  assert.equal(restored.revision,3);
  assert.equal(restored.history.length,0);
  assert.equal(restored.reviewedRevision,null);
});

test('invalid edits cannot mutate a valid draft', () => {
  const original=createLesson();const serialized=JSON.stringify(original);
  const bad=copy(original.content);bad.visual.lt1=bad.visual.lt2;
  assert.throws(()=>reviseLesson(original,bad),/LT1/);
  assert.equal(JSON.stringify(original),serialized);
});

test('JSON round trip preserves lesson content but creates a fresh unreviewed identity', () => {
  const original=createLesson();original.reviewedRevision=1;
  const result=importLesson(JSON.parse(JSON.stringify(exportLesson(original))));
  assert.deepEqual(result.lesson.content,original.content);
  assert.notEqual(result.lesson.id,original.id);
  assert.equal(result.lesson.reviewedRevision,null);
  assert.equal(result.sourceNotesReconciled,false);
});

test('an import cannot install its own evidence URLs or approval flag', () => {
  const record=exportLesson(createLesson());
  record.reviewedRevision=1;record.evidenceSnapshot.sources[0].url='https://untrusted.invalid/fake';
  const imported=importLesson(record);
  assert.equal(imported.lesson.evidenceSnapshot.sources[0].url,catalog.sources[0].url);
  assert.equal(imported.lesson.reviewedRevision,null);
  assert.equal(imported.sourceNotesReconciled,true);
});

test('unsupported versions and executable fields are rejected', () => {
  const record=exportLesson(createLesson());record.content.schemaVersion=999;
  assert.throws(()=>importLesson(record),/version/);
  record.content.schemaVersion=1;record.content.script='alert(1)';
  assert.throws(()=>importLesson(record),/fields/);
});

test('saved lessons with corrupt revision history are not restored', () => {
  const record=createLesson();assert.equal(validStoredLesson(record),true);
  record.history=[{content:{arbitrary:'data'}}];
  assert.equal(validStoredLesson(record),false);
});
