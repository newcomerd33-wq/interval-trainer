// =============================================================================
// FOLDERS
// -----------------------------------------------------------------------------
// Saved timers ("library" items) can be filed into folders. The model is FLAT,
// not a tree: each library item carries an optional `folderId` (null/absent =
// unfiled/root), and folders are a separate ordered list. "Moving" an item is
// just reassigning its folderId — no nesting, no reparenting trees.
//
// Pure functions only (no localStorage, no React) so they're node-testable. IDs
// and timestamps are injectable for deterministic tests. App owns persistence.
//
// Folder shape: { id, name, createdAt }
// =============================================================================

const defaultId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function addFolder(folders, name, opts = {}) {
  const idFn = opts.idFn || defaultId;
  const now = opts.now != null ? opts.now : Date.now();
  const folder = { id: idFn(), name: String(name || '').trim(), createdAt: now };
  // Newest first, mirroring how the library prepends.
  return { folders: [folder, ...(folders || [])], folder };
}

export function renameFolder(folders, id, name) {
  const trimmed = String(name || '').trim();
  return (folders || []).map((f) => (f.id === id ? { ...f, name: trimmed } : f));
}

// Remove a folder. Items are NOT deleted — the caller unfiles them (folderId ->
// null) via `unfileItems`. Splitting these keeps each list op single-purpose.
export function removeFolder(folders, id) {
  return (folders || []).filter((f) => f.id !== id);
}

// Reassign one item's folder. folderId === null unfiles it (back to root).
export function moveItemToFolder(library, itemId, folderId) {
  return (library || []).map((it) => (it.id === itemId ? { ...it, folderId: folderId ?? null } : it));
}

// Clear folderId on every item pointing at `folderId` (used after a folder is
// deleted so its timers fall back to root instead of dangling).
export function unfileItems(library, folderId) {
  return (library || []).map((it) => (it.folderId === folderId ? { ...it, folderId: null } : it));
}

// Group library items into render-ready sections: one per folder (in folder-list
// order) plus a trailing "Unfiled" bucket for items with no/!matching folderId.
// Each section: { id, name, isUnfiled, items }. Item order within a section
// preserves the library array order. Folders with no items still appear (so an
// empty folder you just made is visible and targetable).
export function groupLibraryByFolder(library, folders) {
  const lib = library || [];
  const known = new Set((folders || []).map((f) => f.id));
  const byFolder = new Map();
  for (const f of folders || []) byFolder.set(f.id, []);
  const unfiled = [];

  for (const it of lib) {
    const fid = it.folderId ?? null;
    if (fid != null && known.has(fid)) byFolder.get(fid).push(it);
    else unfiled.push(it);
  }

  const sections = (folders || []).map((f) => ({
    id: f.id,
    name: f.name,
    isUnfiled: false,
    items: byFolder.get(f.id),
  }));
  // Unfiled last; always present so root items have a home even with 0 folders.
  sections.push({ id: null, name: 'Unfiled', isUnfiled: true, items: unfiled });
  return sections;
}
