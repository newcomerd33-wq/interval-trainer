// Pure-function tests for the folders model.
//   npm test     (or)   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addFolder, renameFolder, removeFolder, moveItemToFolder, unfileItems, groupLibraryByFolder } from './folders.js';

const opts = { idFn: (() => { let n = 0; return () => `f${++n}`; })(), now: 1000 };

test('addFolder prepends a trimmed folder and returns it', () => {
  const { folders, folder } = addFolder([{ id: 'a', name: 'A' }], '  Legs  ', opts);
  assert.equal(folder.name, 'Legs');
  assert.equal(folder.createdAt, 1000);
  assert.equal(folders.length, 2);
  assert.equal(folders[0].id, folder.id); // newest first
  assert.equal(folders[1].id, 'a');
});

test('renameFolder trims and only touches the target', () => {
  const out = renameFolder([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'b', '  Pull ');
  assert.deepEqual(out, [{ id: 'a', name: 'A' }, { id: 'b', name: 'Pull' }]);
});

test('removeFolder drops the folder but leaves items to the caller', () => {
  assert.deepEqual(removeFolder([{ id: 'a' }, { id: 'b' }], 'a'), [{ id: 'b' }]);
});

test('moveItemToFolder reassigns one item; null unfiles', () => {
  const lib = [{ id: 'x', folderId: null }, { id: 'y', folderId: 'a' }];
  assert.equal(moveItemToFolder(lib, 'x', 'a')[0].folderId, 'a');
  assert.equal(moveItemToFolder(lib, 'y', null)[1].folderId, null);
  // untouched items keep identity-by-value
  assert.deepEqual(moveItemToFolder(lib, 'x', 'a')[1], { id: 'y', folderId: 'a' });
});

test('unfileItems clears folderId only for the deleted folder', () => {
  const lib = [{ id: 'x', folderId: 'a' }, { id: 'y', folderId: 'b' }];
  const out = unfileItems(lib, 'a');
  assert.equal(out[0].folderId, null);
  assert.equal(out[1].folderId, 'b');
});

test('groupLibraryByFolder: folder order preserved, items in lib order, Unfiled last', () => {
  const folders = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const lib = [
    { id: '1', folderId: 'b' },
    { id: '2', folderId: null },
    { id: '3', folderId: 'a' },
    { id: '4', folderId: 'b' },
    { id: '5' }, // no folderId -> unfiled
  ];
  const sections = groupLibraryByFolder(lib, folders);
  assert.deepEqual(sections.map((s) => s.name), ['A', 'B', 'Unfiled']);
  assert.deepEqual(sections[0].items.map((i) => i.id), ['3']);
  assert.deepEqual(sections[1].items.map((i) => i.id), ['1', '4']);
  assert.deepEqual(sections[2].items.map((i) => i.id), ['2', '5']);
  assert.equal(sections[2].isUnfiled, true);
});

test('groupLibraryByFolder: item pointing at a deleted folder falls back to Unfiled', () => {
  const sections = groupLibraryByFolder([{ id: '1', folderId: 'gone' }], [{ id: 'a', name: 'A' }]);
  assert.deepEqual(sections[0].items, []);          // empty real folder still present
  assert.deepEqual(sections[1].items.map((i) => i.id), ['1']); // orphan -> Unfiled
});

test('groupLibraryByFolder: empty folders still appear (targetable)', () => {
  const sections = groupLibraryByFolder([], [{ id: 'a', name: 'A' }]);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0], { id: 'a', name: 'A', isUnfiled: false, items: [] });
});
