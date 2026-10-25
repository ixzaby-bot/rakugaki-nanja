import { normalizeGame } from './game.js';
let database;
let seenRevision = 0;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
export class ConflictError extends Error {
  constructor() { super('別のタブで更新されました。このタブを再読み込みしてから続けてね。'); this.name = 'ConflictError'; }
}
function friendly(error) {
  if (error?.name === 'QuotaExceededError') return new Error('保存容量が足りません。保存できていないので、不要なセットや端末のデータを整理してから、もう一度保存してね。');
  return error;
}
export async function initStorage() {
  database = await new Promise((resolve, reject) => {
    const open = indexedDB.open('rakugaki-nanja', 1);
    open.onupgradeneeded = () => { for (const name of ['sets', 'images', 'sessions']) open.result.createObjectStore(name, { keyPath: 'id' }); };
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('別のタブを閉じてから、もう一度開いてね。'));
  });
  database.onversionchange = () => { database.close(); window.dispatchEvent(new Event('storage-conflict')); };
}
async function transaction(stores, mode, callback) {
  const tx = database.transaction(stores, mode);
  const complete = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('保存が中止されました。変更は確定していません。')); tx.onerror = () => {}; });
  complete.catch(() => {});
  try { const result = await callback(tx); await complete; return result; }
  catch (error) { try { tx.abort(); } catch {} await complete.catch(() => {}); throw friendly(error); }
}
export const listSets = () => transaction(['sets'], 'readonly', tx => request(tx.objectStore('sets').getAll()));
export const getImage = id => transaction(['images'], 'readonly', async tx => (await request(tx.objectStore('images').get(id)))?.blob);
export async function loadSession() {
  const record = await transaction(['sessions'], 'readonly', tx => request(tx.objectStore('sessions').get('active')));
  seenRevision = record?.revision || 0; return normalizeGame(record?.game || null);
}
// Include the game's snapshot so set edits/deletion cannot break a running game.
async function collectImages(tx) {
  const sets = await request(tx.objectStore('sets').getAll());
  const session = await request(tx.objectStore('sessions').get('active'));
  const characters = [...sets.flatMap(set => set.characters), ...(session?.game?.characters || [])];
  const referenced = new Set(characters.flatMap(c => [c.imageId, c.sourceImageId].filter(Boolean)));
  const store = tx.objectStore('images'); const keys = await request(store.getAllKeys());
  for (const key of keys) if (!referenced.has(key)) store.delete(key);
}
export async function saveSet(set, images = []) {
  const revision = await transaction(['sets', 'images', 'sessions'], 'readwrite', async tx => {
    const store = tx.objectStore('sets'); const previous = await request(store.get(set.id));
    if ((previous?.revision || 0) !== (set.revision || 0)) throw new ConflictError();
    for (const image of images) tx.objectStore('images').put(image);
    for (const c of set.characters) {
      for (const imageId of [c.imageId, c.sourceImageId].filter(Boolean)) {
        if (!await request(tx.objectStore('images').getKey(imageId))) throw new Error('画像が別のタブで削除されました。再読み込みしてセットを選び直してね。');
      }
    }
    const nextRevision = (previous?.revision || 0) + 1;
    store.put({ ...set, revision: nextRevision }); await collectImages(tx); return nextRevision;
  });
  set.revision = revision;
}
export async function deleteSet(id, revision) {
  await transaction(['sets', 'images', 'sessions'], 'readwrite', async tx => {
    const previous = await request(tx.objectStore('sets').get(id));
    if (previous?.isPreset) throw new Error('プリセットは削除できません。');
    if (previous?.revision !== revision) throw new ConflictError();
    tx.objectStore('sets').delete(id); await collectImages(tx);
  });
}
export async function saveSession(game) {
  const nextRevision = await transaction(['sets', 'images', 'sessions'], 'readwrite', async tx => {
    const store = tx.objectStore('sessions'); const previous = await request(store.get('active'));
    if ((previous?.revision || 0) !== seenRevision) throw new ConflictError();
    for (const c of game?.characters || []) if (!await request(tx.objectStore('images').getKey(c.imageId))) throw new Error('セットの画像が変更されました。セットを選び直してね。');
    const revision = seenRevision + 1; store.put({ id: 'active', revision, game }); await collectImages(tx); return revision;
  });
  seenRevision = nextRevision;
}
export const discardSession = () => saveSession(null);
