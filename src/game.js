// Rules have no DOM, storage, or network dependencies.
import { newId } from './ids.js';
import { createMask } from './masks.js';
export const isHideCard = card => typeof card === 'object' && card?.kind === 'hide';
export const collectedCards = player => player.cardsWon ?? player.score;
// Old sessions and their Undo snapshots stay playable as normal games.
export function normalizeGame(value) {
  if (!value) return value;
  const g = clone(value);
  g.mode ??= 'normal'; g.hideCardCount ??= 4; g.hideInserted ??= false;
  g.actualHideCount ??= 0; g.specialsDrawn ??= 0; g.activeMask ??= null;
  g.lastMaskByCharacterId ??= {};
  g.players.forEach(p => { p.cardsWon ??= p.score; });
  g.history = (g.history || []).map(snapshot => { const normalized = normalizeGame({ ...snapshot, history: [] }); delete normalized.history; return normalized; });
  return g;
}
export const clone = value => structuredClone(value);
export function validName(value) {
  const name = String(value ?? '').trim();
  if (!name || Array.from(name).length > 40) throw new Error('名前は1〜40文字で入力してね。');
  return name;
}
export function shuffle(cards, random = Math.random) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createGame(set, ids, copies, playerNames, random = Math.random, options = {}) {
  const { mode = 'normal', hideCardCount = 4 } = options;
  if (!['normal','hide'].includes(mode) || ![2,4,6,8].includes(hideCardCount)) throw new Error('ゲームモードと特殊カード枚数を選び直してね。');
  if (new Set(ids).size !== ids.length || ids.length < 3 || ids.some(id => !set.characters.some(c => c.id === id))) throw new Error('キャラクターを3種類以上選んでね。');
  if (!Number.isInteger(copies) || copies < 2 || copies > 8) throw new Error('カード枚数は2〜8枚で選んでね。');
  const names = playerNames.map(validName);
  if (names.length < 2 || names.length > 8) throw new Error('プレイヤーは2〜8人にしてね。');
  if (new Set(names).size !== names.length) throw new Error('プレイヤーの名前は別々にしてね。');
  const now = new Date().toISOString();
  return {
    id: newId(), cardSetId: set.id, cardSetTitle: set.title,
    characters: clone(set.characters.filter(c => ids.includes(c.id))),
    selectedCharacterIds: [...ids], copiesPerCharacter: copies,
    players: names.map((name, i) => ({ id: `p${i}`, name, score: 0, cardsWon: 0 })),
    mode, hideCardCount, hideInserted: false, actualHideCount: 0, specialsDrawn: 0,
    activeMask: null, lastMaskByCharacterId: {},
    deck: shuffle(ids.flatMap(id => Array(copies).fill(id)), random), pot: [],
    currentCardId: null, namesByCharacterId: {}, status: 'beforeDraw',
    startedAt: now, updatedAt: now, endedAt: null, history: []
  };
}
export function assertGame(g) {
  const total = g.selectedCharacterIds.length * g.copiesPerCharacter;
  if (g.deck.filter(card => !isHideCard(card)).length + g.pot.length + g.players.reduce((sum, p) => sum + collectedCards(p), 0) !== total) throw new Error('カード枚数が一致しません。');
  if (g.pot.some(isHideCard)) throw new Error('特殊カードは場札に入りません。');
  if (g.deck.some((card, i) => isHideCard(card) && (i === g.deck.length - 1 || isHideCard(g.deck[i+1])))) throw new Error('特殊カードの配置が不正です。');
  if (g.deck.filter(isHideCard).length + (g.specialsDrawn || 0) !== (g.actualHideCount || 0)) throw new Error('特殊カード枚数が一致しません。');
  if (['naming', 'judging'].includes(g.status) && g.pot.at(-1) !== g.currentCardId) throw new Error('場札の状態が一致しません。');
  return g;
}
export function transition(game, action, random = Math.random) {
  game = normalizeGame(game);
  if (action.type === 'undo') {
    if (!game.history.length) throw new Error('戻せる操作がありません。');
    const restored = clone(game.history.at(-1));
    restored.history = clone(game.history.slice(0, -1));
    restored.updatedAt = new Date().toISOString();
    return assertGame(restored);
  }
  const g = clone(game);
  const previous = clone(game);
  delete previous.history;
  const finishTurn = () => {
    g.activeMask = null;
    g.status = g.deck.length ? 'beforeDraw' : 'finished';
    if (g.status === 'finished') g.endedAt = new Date().toISOString();
  };
  switch (action.type) {
    case 'draw':
      if (g.status !== 'beforeDraw' || !g.deck.length) throw new Error('今のカードを先に確定してね。');
      if (isHideCard(g.deck[0])) {
        g.deck.shift(); g.specialsDrawn++; g.currentCardId = null;
        g.status = 'hideCard'; g.activeMask = null;
        break;
      }
      // Fall through to normal drawing after the special-card interstitial.
    case 'draw-hidden': {
      if (action.type === 'draw-hidden' && g.status !== 'hideCard') throw new Error('今は隠れたカードをめくれません。');
      const hidden = g.status === 'hideCard';
      g.currentCardId = g.deck.shift();
      g.pot.push(g.currentCardId);
      g.status = g.namesByCharacterId[g.currentCardId] ? 'judging' : 'naming';
      if (hidden) {
        g.activeMask = createMask(g.lastMaskByCharacterId[g.currentCardId], random);
        g.lastMaskByCharacterId[g.currentCardId] = g.activeMask.type;
      }
      break;
    }
    case 'name':
      if (g.status !== 'naming') throw new Error('今は命名できません。');
      g.namesByCharacterId[g.currentCardId] = validName(action.name);
      finishTurn();
      if (g.mode === 'hide' && !g.hideInserted && g.selectedCharacterIds.every(id => Object.hasOwn(g.namesByCharacterId, id))) {
        g.status = 'hideAnnouncement'; g.endedAt = null;
      }
      break;
    case 'start-hide': {
      if (g.mode !== 'hide' || g.status !== 'hideAnnouncement' || g.hideInserted) throw new Error('かくれんぼはすでに開始しています。');
      // Each normal card has one slot immediately before it: never adjacent or last.
      const slots = new Set(shuffle(g.deck.map((_, i) => i), random).slice(0, g.hideCardCount));
      g.actualHideCount = slots.size;
      g.deck = g.deck.flatMap((card, i) => slots.has(i) ? [{ kind:'hide' }, card] : [card]);
      g.hideInserted = true;
      finishTurn();
      break;
    }
    case 'award': {
      if (g.status !== 'judging') throw new Error('今は獲得できません。');
      const player = g.players.find(p => p.id === action.playerId);
      if (!player) throw new Error('プレイヤーを選んでね。');
      player.cardsWon += g.pot.length;
      player.score += g.pot.length * (g.activeMask ? 2 : 1);
      g.pot = [];
      finishTurn();
      break;
    }
    case 'skip':
      if (g.status !== 'judging') throw new Error('今は判定できません。');
      finishTurn();
      break;
    case 'rename':
      if (!g.namesByCharacterId[action.characterId]) throw new Error('まだ名前がありません。');
      g.namesByCharacterId[action.characterId] = validName(action.name);
      break;
    default: throw new Error('不明な操作です。');
  }
  g.history = [...game.history.slice(-19), previous];
  g.updatedAt = new Date().toISOString();
  return assertGame(g);
}
export function ranking(g) {
  return [...g.players].sort((a, b) => b.score - a.score).map(p => ({ ...p, rank: 1 + g.players.filter(other => other.score > p.score).length }));
}
