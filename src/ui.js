import { createGame, transition, ranking, collectedCards } from './game.js';
import { maskSvg } from './masks.js';
import * as db from './storage.js';
import { loadPreset } from './presets.js';
import { normalizeImage, cropImage } from './images.js';
import { SpeechInput } from './speech.js';
import { newId } from './ids.js';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
let sets = [], game = null, screen = 'home', selected = null, ids = [], busy = false;
let setupNames = ['プレイヤー1', 'プレイヤー2'], copies = 4;
let mode = 'normal', hideCardCount = 4;
let draft = null, dirty = false;
const pendingImages = new Map();
const speech = new SpeechInput();
const urls = new Map();
const button = (text, action, cls = '', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const picture = (character, cls = '', alt = 'キャラクターの絵') => `<img class="${cls}" src="${esc(urls.get(character.imageId) || '')}" alt="${esc(alt)}" draggable="false">`;
function notice(message) { const el = document.querySelector('#notice'); el.textContent = message; el.hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => { el.hidden = true; }, 6500); }
async function cacheImages(characters) {
  for (const character of characters) if (!urls.has(character.imageId)) {
    const blob = await db.getImage(character.imageId);
    if (blob) urls.set(character.imageId, URL.createObjectURL(blob));
  }
}
async function refresh() {
  sets = await db.listSets();
  const characters = [...sets.flatMap(set => set.characters), ...(game?.characters || [])];
  await cacheImages(characters);
  const referenced = new Set(characters.map(c => c.imageId));
  for (const [id, url] of urls) if (!referenced.has(id)) { URL.revokeObjectURL(url); urls.delete(id); }
}
export async function boot() {
  try {
    await db.initStorage();
    sets = await db.listSets();
    try {
      const preset = await loadPreset(sets.map(set => set.id));
      if (preset) await db.saveSet(preset.set, preset.images);
    } catch (error) {
      if (!sets.length) throw error;
      notice('プリセットを更新できませんでした。保存済みのセットで遊べます。');
    }
    game = await db.loadSession(); await refresh(); render();
  } catch (error) {
    app.innerHTML = `<main class="shell"><h1>準備ができませんでした</h1><p>${esc(error.message)}</p><p>通常ブラウザで開き、保存領域と通信を確認してね。</p>${button('もう一度読み込む', 'reload', 'primary')}</main>`;
  }
}
function frame(content, title = '') {
  app.innerHTML = `<header class="topbar">${button('✳ ラクガキナンジャ！？', 'home', 'brand')}<span class="tag">みんなで あそぼ！</span></header><main class="shell" id="main">${title ? `<div class="page-heading">${button('←', 'back', 'icon', 'aria-label="戻る"')}<h1>${title}</h1></div>` : ''}${content}</main><footer>絵からはじまる、へんてこな思い出。</footer>`;
}
function render() {
  if (screen === 'home') renderHome();
  if (screen === 'sets') renderSets();
  if (screen === 'select') renderSelection();
  if (screen === 'setup') renderSetup();
  if (screen === 'game') renderGame();
  if (screen === 'rules') renderRules();
  if (screen === 'names') renderNames();
  if (screen === 'editor') renderEditor();
}
function go(next) { stopSpeech(); screen = next; render(); window.scrollTo(0, 0); }
function renderHome() {
  const preset = sets.find(set => set.isPreset);
  frame(`<section class="hero"><span class="eyebrow">そのラクガキ、なんて名前？</span><h1>ラクガキ<br><span>ナンジャ<span class="punctuation">！？</span></span></h1><p>へんな名前をつけて、覚えて、叫ぼう。<br>1台のスマホを囲む、みんなのカードゲーム。</p><div class="hero-cards">${preset?.characters.slice(0, 3).map(c => `<div class="mini-card">${picture(c)}</div>`).join('') || ''}<span class="scribble">きみはだれ？</span></div><div class="home-actions">${game && game.status !== 'finished' ? button('↪ つづきから', 'resume', 'primary') : ''}${button('あそぶ <span>→</span>', 'play', 'primary')}${button('✎ カードをつくる', 'new', 'secondary')}${button('あそびかた', 'rules', 'text-button')}</div><div class="facts"><span>2〜8人</span><span>スマホ1台</span><span>登録いらず</span></div></section><aside class="paper-note"><b>自分の絵が、主役になる。</b><p>紙に描いた絵を撮って、自分だけのカードに。<br>まずは8種類のラクガキであそべるよ。</p></aside><p class="fine">データはこのブラウザに保存します。履歴削除や端末の空き容量によって消える場合があります。</p>`);
}
function renderSets() {
  frame(`<p class="intro">今日はどのラクガキであそぶ？</p><div class="set-list">${sets.map(set => `<article class="set-card"><div class="set-preview">${set.characters.slice(0, 3).map(c => picture(c)).join('')}</div><span class="eyebrow">${set.isPreset ? 'プリセット' : '自分のカード'}</span><h2>${esc(set.title)}</h2><p>${set.characters.length}種類のキャラクター</p>${button('このセットであそぶ →', 'choose', 'primary', `data-id="${esc(set.id)}"`)}<div class="row">${!set.isPreset ? button('編集', 'edit', 'small', `data-id="${esc(set.id)}"`) : ''}${button('複製', 'duplicate', 'small', `data-id="${esc(set.id)}"`)}${!set.isPreset ? button('削除', 'delete', 'small danger', `data-id="${esc(set.id)}"`) : ''}</div></article>`).join('')}</div>${button('＋ 新しいカードセット', 'new', 'secondary wide')}`, 'カードをえらぶ');
}
function renderSelection() {
  frame(`<p class="eyebrow">${esc(selected.title)}</p><p>使う子をタップして選ぼう。おすすめは8〜20種類。</p><div class="selection-actions">${button('全員えらぶ', 'select-all', 'small')}${button('選択をはずす', 'select-none', 'small')}</div><div class="character-grid">${selected.characters.map(c => `<label class="character-check"><input type="checkbox" name="character" value="${esc(c.id)}" ${ids.includes(c.id) ? 'checked' : ''}>${picture(c)}<span>キャラクター ${selected.characters.indexOf(c) + 1}</span></label>`).join('')}</div><div class="sticky-action"><p id="selection-count">${ids.length}種類を選択中${ids.length < 3 ? '・3種類以上えらんでね' : ''}</p>${button('プレイヤーを決める →', 'setup', 'primary wide', ids.length < 3 ? 'disabled' : '')}</div>`, 'どの子であそぶ？');
}
function modeSettings() {
  return `<fieldset class="panel mode-settings"><legend>ゲームモード</legend><label class="mode-option"><input type="radio" name="game-mode" value="normal" ${mode === 'normal' ? 'checked' : ''}><span><b>ノーマルモード</b><small>名前を覚えて、場札を総取り。いつものルールであそぼう。</small></span></label><label class="mode-option"><input type="radio" name="game-mode" value="hide" ${mode === 'hide' ? 'checked' : ''}><span><b>かくれんぼモード</b><small>全員の命名後に特殊カードが登場。隠れた絵をあてたらポイント2ばい！</small></span></label>${mode === 'hide' ? `<label class="field hide-count-label">かくれんぼカード<select id="hide-count">${[2,4,6,8].map(n => `<option value="${n}" ${hideCardCount === n ? 'selected' : ''}>${n}枚</option>`).join('')}</select></label><p class="fine">残り山札が少ないときは自動で減らします。特殊カード自体は得点になりません。</p>` : ''}</fieldset>`;
}
function modeBadge() { return `<p class="mode-badge">${game.mode === 'hide' ? 'かくれんぼモード' : 'ノーマルモード'}</p>`; }
function scoreUnit() { return game.mode === 'hide' ? 'ポイント' : '枚'; }
function gameMenu() { return `<nav class="game-menu">${button('一時停止', 'pause', 'text-button')}${button('↶ 1手戻す', 'undo', 'text-button', !game.history.length ? 'disabled' : '')}</nav>`; }
function renderAnnouncement() {
  const count = Math.min(game.hideCardCount, game.deck.length);
  frame(`<section class="hide-announcement">${modeBadge()}<p class="announcement-heading">全キャラクター命名完了！</p><div class="hide-animation" aria-hidden="true"><span>？</span>${picture(game.characters[0])}<span>？</span></div><h1>かくれんぼタイム！</h1><p>これから『かくれんぼカード』が登場するよ！</p><strong class="double-callout">あてたら ポイント2ばい！</strong><p class="fine">${count ? `${count}枚のかくれんぼカードが仲間入り。` : '今回は残り山札がないので、追加は0枚です。スタートを押すと結果に進むよ。'}</p>${button('かくれんぼ スタート！', 'start-hide', 'primary wide')}${gameMenu()}</section>`);
}
function renderHideCard() {
  frame(`${modeBadge()}<section class="special-turn"><div class="special-card"><span>？</span><h1>かくれんぼカード！</h1><p>次の子がかくれているよ。</p><strong>あてたらポイント2ばい！</strong></div><p>場札は${game.pot.length}枚。<br>このカードは得点に含めないよ。</p>${button('かくれたカードをめくる →', 'draw-hidden', 'primary wide')}${gameMenu()}</section>`);
}
function renderSetup() {
  frame(`${modeSettings()}<section class="panel"><h2>${esc(selected.title)}</h2><label class="field">同じ子を何枚ずつ？<select id="copies">${[2,3,4,5,6,7,8].map(n => `<option ${copies === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><p class="deck-total"><b>${ids.length}</b>種類 × <b>${copies}</b>枚 ＝ <strong>${ids.length * copies}枚</strong></p></section><section class="panel"><h2>あそぶ人 <small>2〜8人</small></h2><div id="players">${setupNames.map((name, i) => `<div class="player-field"><label for="player-${i}">${i + 1}</label><input id="player-${i}" name="player" value="${esc(name)}" maxlength="40" autocomplete="off" aria-label="プレイヤー${i + 1}の名前">${setupNames.length > 2 ? button('×', 'remove-player', 'icon', `data-index="${i}" aria-label="プレイヤー${i + 1}を削除"`) : ''}</div>`).join('')}</div>${setupNames.length < 8 ? button('＋ プレイヤーを追加', 'add-player', 'text-button') : ''}</section>${button('ゲーム開始！', 'start', 'primary wide')}<p class="fine">このゲームの名前と得点を新しくしてスタートします。</p>`, 'あそぶ準備');
}
function renderGame() {
  if (!game) return go('home');
  if (game.status === 'finished') return renderResult();
  if (game.status === 'hideAnnouncement') return renderAnnouncement();
  if (game.status === 'hideCard') return renderHideCard();
  const current = game.characters.find(c => c.id === game.currentCardId);
  const naming = game.status === 'naming', judging = game.status === 'judging';
  frame(`${modeBadge()}<div class="game-stats"><div>山札 <strong>${game.deck.length}</strong> 枚</div><div>場札 <strong>${game.pot.length}</strong> 枚</div></div><div class="game-card ${!current ? 'card-back' : ''}">${current ? `<div class="card-art">${picture(current)}${game.activeMask ? maskSvg(game.activeMask) : ''}</div>` : '<span>✳</span><b>ナンジャ！？</b><p>さあ、最初の1枚！</p>'}</div><section class="game-controls">${game.activeMask ? '<p class="double-badge">かくれんぼ中・あてたらポイント2ばい！</p>' : ''}${naming ? `<h1>この子に名前をつけよう！</h1><form id="name-form"><label class="sr-only" for="character-name">キャラクターの名前</label><input id="character-name" name="character-name" placeholder="どんな名前にする？" maxlength="80" autocomplete="off" required>${speechMarkup()}<button class="primary wide" type="submit">この名前で決定</button></form><p class="fine">初登場のカードは場に残るよ。</p>` : judging ? `<h1>誰がいちばんに言えた？</h1><div class="winner-grid">${game.players.map((p, i) => button(esc(p.name), 'award', `player-color color-${i % 4}`, `data-id="${p.id}"`)).join('')}</div><div class="row">${button('名前を確認', 'reveal', 'secondary')}${button('誰も正解しなかった／次へ', 'skip', 'text-button')}</div><p class="fine">勝者と正解は、みんなで決めてね。</p>` : button('カードをめくる →', 'draw', 'primary wide flip-button')}</section><div class="score-strip">${game.players.map(p => `<div><span>${esc(p.name)}</span><b>${p.score}<small> ${scoreUnit()}</small></b></div>`).join('')}</div><nav class="game-menu">${button('一時停止', 'pause', 'text-button')}${button('名前一覧', 'names', 'text-button')}${button('↶ 1手戻す', 'undo', 'text-button', !game.history.length ? 'disabled' : '')}</nav>`);
}
function renderResult() {
  const ranks = ranking(game), winners = ranks.filter(p => p.rank === 1);
  const minutes = Math.floor((new Date(game.endedAt) - new Date(game.startedAt)) / 60000);
  frame(`${modeBadge()}<section class="result-hero"><span class="eyebrow">おつかれさま！</span><div class="trophy">✷</div><h1>${winners.length > 1 ? '同率優勝！' : '優勝！'}</h1><p class="winner-names">${winners.map(p => esc(p.name)).join(' ＆ ')}</p></section><div class="ranking">${ranks.map(p => `<div><span class="rank">${p.rank}</span><b>${esc(p.name)}${game.mode === 'hide' ? `<small class="cards-won">獲得カード ${collectedCards(p)}枚</small>` : ''}</b><strong>${p.score}<small> ${scoreUnit()}</small></strong></div>`).join('')}</div><div class="panel result-meta">${game.mode === 'hide' ? `<p>合計ポイント <b>${game.players.reduce((sum,p) => sum + p.score, 0)}ポイント</b></p>` : ''}<p>獲得したカード <b>${game.players.reduce((s, p) => s + collectedCards(p), 0)}枚</b></p><p>未獲得のカード <b>${game.pot.length}枚</b></p><p>使ったセット <b>${esc(game.cardSetTitle)}</b></p><p>ゲーム時間（中断を含む） <b>${minutes}分</b></p></div>${button('同じセットでもう一度', 'replay', 'primary wide')}${button('カードセット選択へ戻る', 'play', 'secondary wide')}${button('↶ 最後の操作を戻す', 'undo', 'text-button wide')}`);
}
function renderRules() {
  frame(`<ol class="rules"><li><b>絵をえらんで、みんなで集まろう</b><p>2〜8人でスマホを囲んでね。自分の絵もカードにできるよ。</p></li><li><b>はじめての子には名前を！</b><p>みんなで考えた名前を入力。カードは場に残るよ。</p></li><li><b>また出てきたら、名前を叫ぼう！</b><p>いちばんに正しく言えた人を選ぶと、場のカードを全部もらえるよ。誰もわからなかったら、そのまま次へ。</p></li><li><b>いちばん集めた人が優勝！</b><p>山札がなくなったらおしまい。場に残ったカードは誰の点にもならないよ。同点なら一緒に優勝！</p></li></ol><aside class="paper-note"><b>かくれんぼモードもあるよ！</b><p>全員の名前が決まったら、かくれんぼタイム。特殊カードの次の絵は一部が隠れるよ。あてた人は場札を総取りして、そのポイントが2ばい！特殊カードは得点に含めず、誰もあてられなければ場札だけを次へ持ち越すよ。いちばんポイントを集めた人が優勝！</p></aside><aside class="paper-note"><b>音声入力は、命名のお手伝い。</b><p>声の速さや正解は自動で判定しません。勝者はみんなで相談して決めてね。名前は手入力でも登録できます。</p></aside>${button('あそんでみる →', 'play', 'primary wide')}`, 'あそびかた');
}
function renderNames() {
  frame(`<p>確認・訂正したら、ゲームに戻ろう。</p><div class="name-list">${Object.entries(game.namesByCharacterId).map(([id, name]) => `<form class="name-edit" data-id="${esc(id)}">${picture(game.characters.find(c => c.id === id))}<label><span class="sr-only">登録した名前</span><input name="new-name" value="${esc(name)}" maxlength="80" required></label><button type="submit" class="small">訂正</button></form>`).join('') || '<p>まだ名前はついていないよ。</p>'}</div>${button('ゲームに戻る', 'resume', 'primary wide')}`, '名前一覧');
}
function modal(title, content, confirmText, callback) {
  stopSpeech();
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<div class="dialog-body"><h2>${esc(title)}</h2>${content}<div class="dialog-actions">${confirmText ? `<button type="button" class="primary" id="dialog-confirm">${esc(confirmText)}</button>` : ''}<button type="button" id="dialog-close" class="secondary">${confirmText ? 'やめる' : '閉じる'}</button></div></div>`;
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('#dialog-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  if (confirmText) dialog.querySelector('#dialog-confirm').onclick = async () => { dialog.close(); await guarded(callback); };
}
async function guarded(fn) {
  if (busy) return;
  busy = true; app.setAttribute('aria-busy', 'true');
  try { await fn(); } catch (error) {
    if (error.name === 'ConflictError') modal('別のタブで更新されています', `<p>${esc(error.message)}</p>`, '再読み込み', () => location.reload());
    else notice(error.message || '操作できませんでした。もう一度試してね。');
  }
  finally { busy = false; app.removeAttribute('aria-busy'); }
}
async function commit(action) {
  const next = transition(game, action);
  await db.saveSession(next); game = next; stopSpeech(); render();
}
function readSetup() {
  setupNames = [...app.querySelectorAll('[name="player"]')].map(input => input.value);
  copies = Number(app.querySelector('#copies')?.value || copies);
  mode = app.querySelector('[name="game-mode"]:checked')?.value || mode;
  hideCardCount = Number(app.querySelector('#hide-count')?.value || hideCardCount);
}
app.addEventListener('change', event => {
  if (event.target.name === 'character') { ids = [...app.querySelectorAll('[name="character"]:checked')].map(input => input.value); renderSelection(); }
  if (event.target.matches('#copies, #hide-count, [name="game-mode"]')) { readSetup(); renderSetup(); }
  if (event.target.matches('#photo-files, #camera-file')) {
    const files = [...event.target.files]; event.target.value = '';
    guarded(() => importFiles(files));
  }
});
app.addEventListener('input', event => { if (event.target.id === 'set-title') { draft.title = event.target.value; dirty = true; } });
app.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'name-form') guarded(() => commit({ type: 'name', name: app.querySelector('#character-name').value }));
  if (event.target.classList.contains('name-edit')) guarded(async () => { await commit({ type: 'rename', characterId: event.target.dataset.id, name: new FormData(event.target).get('new-name') }); notice('名前を訂正しました。'); });
});
app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  guarded(async () => {
    switch (action) {
      case 'reload': location.reload(); break;
      case 'home': await leaveTo('home'); break;
      case 'back': await leaveTo(screen === 'setup' ? 'select' : screen === 'select' ? 'sets' : screen === 'names' ? 'game' : 'home'); break;
      case 'play': go('sets'); break;
      case 'rules': go('rules'); break;
      case 'choose': selected = sets.find(s => s.id === target.dataset.id); ids = selected.characters.map(c => c.id); go('select'); break;
      case 'select-all': ids = selected.characters.map(c => c.id); render(); break;
      case 'select-none': ids = []; render(); break;
      case 'setup': go('setup'); break;
      case 'add-player': readSetup(); setupNames.push(`プレイヤー${setupNames.length + 1}`); render(); break;
      case 'remove-player': readSetup(); setupNames.splice(Number(target.dataset.index), 1); render(); break;
      case 'start': {
        readSetup(); const next = createGame(selected, ids, copies, setupNames, Math.random, { mode, hideCardCount });
        const start = async () => { await db.saveSession(next); game = next; go('game'); };
        if (game && game.status !== 'finished') modal('今のゲームをやめて始める？', '<p>保存してあるゲームを新しいゲームに置き換えます。</p>', '新しく始める', start); else await start();
        break;
      }
      case 'resume': go('game'); break;
      case 'speech-start': startSpeech(); break;
      case 'speech-stop': speech.cancel('音声入力を中止しました。手入力で続けられるよ。'); break;
      case 'draw': await commit({ type: 'draw' }); break;
      case 'start-hide': await commit({ type: 'start-hide' }); break;
      case 'draw-hidden': await commit({ type: 'draw-hidden' }); break;
      case 'skip': await commit({ type: 'skip' }); break;
      case 'undo': await commit({ type: 'undo' }); break;
      case 'award': {
        const player = game.players.find(p => p.id === target.dataset.id);
        modal(`${player.name}が獲得？`, `<p>場札 <strong>${game.pot.length}枚</strong>をぜんぶもらうよ。${game.activeMask ? `<br><strong>ポイント2ばい！ ${game.pot.length * 2}ポイント獲得</strong>` : ''}</p>`, 'この人が獲得！', () => commit({ type: 'award', playerId: player.id })); break;
      }
      case 'reveal': modal('名前を確認中', `<p class="answer">${esc(game.namesByCharacterId[game.currentCardId])}</p><p>正解と勝者はみんなで決めてね。</p>`); break;
      case 'names': go('names'); break;
      case 'pause': modal('ひとやすみ', '<p>ここまでの進行は保存されています。</p>', 'ホームへ', () => go('home')); break;
      case 'replay': selected = { id: game.cardSetId, title: game.cardSetTitle, characters: game.characters }; ids = [...game.selectedCharacterIds]; copies = game.copiesPerCharacter; mode = game.mode || 'normal'; hideCardCount = game.hideCardCount || 4; setupNames = game.players.map(p => p.name); go('setup'); break;
      default: await editorAction(action, target);
    }
  });
});
async function leaveTo(next) {
  if (screen === 'editor' && dirty) modal('保存せずに戻る？', '<p>まだ保存していない変更はなくなります。</p>', '保存せずに戻る', async () => { clearDraft(); await refresh(); go(next); });
  else { if (screen === 'editor') clearDraft(); go(next); }
}
function clearDraft() { draft = null; dirty = false; pendingImages.clear(); }
function renderEditor() {
  frame(`<label class="field-label" for="set-title">セットの名前</label><input id="set-title" value="${esc(draft.title)}" maxlength="60" placeholder="わが家のラクガキ団"><div class="import-actions">${button('◎ 写真を撮る', 'camera', 'secondary')}${button('＋ 写真／画像を選ぶ', 'photos', 'secondary')}</div><input id="camera-file" type="file" accept="image/*" capture="environment" hidden><input id="photo-files" type="file" accept="image/*" multiple hidden><p class="fine">JPEG・PNG・WebP対応。複数選択は端末により異なります。<br>画像はこの端末で加工し、アップロードしません。</p><div class="editor-grid">${draft.characters.map((c, i) => `<article class="editor-card">${picture(c)}<span>キャラクター ${i + 1}</span><div class="row">${button('切り抜き', 'recrop', 'small', `data-id="${esc(c.id)}"`)}${button('削除', 'remove-image', 'small danger', `data-id="${esc(c.id)}"`)}</div></article>`).join('') || '<div class="empty-state">✎<p>紙に描いた絵や写真を追加しよう。<br>3種類以上あるとゲームで遊べるよ。</p></div>'}</div><div class="sticky-action"><p>${draft.characters.length}種類 ${draft.characters.length < 3 ? '・あそぶには3種類以上必要だよ' : ''}</p>${button('カードセットを保存', 'save-set', 'primary wide')}</div>`, 'カードをつくる');
}
async function importFiles(files) {
  const failures = []; let added = 0;
  for (const [i, file] of files.entries()) {
    try {
      const source = await normalizeImage(file);
      const cropped = await cropImage(source, `${i + 1} / ${files.length} 枚目を切り抜こう`);
      if (!cropped) continue;
      const sourceImageId = newId(), imageId = newId();
      pendingImages.set(sourceImageId, source); pendingImages.set(imageId, cropped);
      urls.set(imageId, URL.createObjectURL(cropped));
      draft.characters.push({ id: newId(), sourceImageId, imageId, createdAt: new Date().toISOString() });
      added++; dirty = true; render();
    } catch (error) { failures.push(`${file.name}: ${error.message}`); }
  }
  if (failures.length) modal('一部の画像を読み込めませんでした', `<p>${added}枚を追加しました。読めなかった画像はスキップしています。</p><ul>${failures.map(message => `<li>${esc(message)}</li>`).join('')}</ul>`);
  else if (added) notice(`${added}枚を追加しました。最後にセットを保存してね。`);
}
async function editorAction(action, target) {
  switch (action) {
    case 'new': clearDraft(); draft = { id: newId(), title: '', isPreset: false, characters: [], updatedAt: new Date().toISOString() }; go('editor'); break;
    case 'edit': {
      const set = sets.find(s => s.id === target.dataset.id);
      if (set.isPreset) throw new Error('プリセットは複製してから編集してね。');
      clearDraft(); draft = structuredClone(set); go('editor'); break;
    }
    case 'duplicate': {
      const original = sets.find(s => s.id === target.dataset.id);
      const copy = { ...structuredClone(original), id: newId(), title: `${original.title} のコピー`, isPreset: false, revision: 0, updatedAt: new Date().toISOString() };
      await db.saveSet(copy); await refresh(); render(); notice('セットを複製しました。編集から絵を追加できるよ。'); break;
    }
    case 'delete': {
      const set = sets.find(s => s.id === target.dataset.id);
      modal('このセットを削除する？', `<p>「${esc(set.title)}」を削除します。進行中のゲームに必要な画像は残します。</p>`, '削除する', async () => { await db.deleteSet(set.id, set.revision); await refresh(); render(); }); break;
    }
    case 'photos': app.querySelector('#photo-files').click(); break;
    case 'camera': app.querySelector('#camera-file').click(); break;
    case 'remove-image': modal('この絵をはずす？', '<p>セットを保存すると削除が確定します。</p>', 'はずす', () => { draft.characters = draft.characters.filter(c => c.id !== target.dataset.id); dirty = true; render(); }); break;
    case 'recrop': {
      const c = draft.characters.find(item => item.id === target.dataset.id);
      const sourceId = c.sourceImageId || c.imageId;
      const source = pendingImages.get(sourceId) || await db.getImage(sourceId);
      const cropped = await cropImage(source, 'もう一度、切り抜こう');
      if (cropped) { const id = newId(); pendingImages.set(id, cropped); urls.set(id, URL.createObjectURL(cropped)); c.sourceImageId = sourceId; c.imageId = id; dirty = true; render(); }
      break;
    }
    case 'save-set': {
      const title = draft.title.trim();
      if (!title || Array.from(title).length > 60) throw new Error('セットの名前を1〜60文字で入力してね。');
      const saved = { ...draft, title, updatedAt: new Date().toISOString() };
      const refs = new Set(draft.characters.flatMap(c => [c.imageId, c.sourceImageId]));
      await db.saveSet(saved, [...pendingImages].filter(([id]) => refs.has(id)).map(([id, blob]) => ({ id, blob })));
      clearDraft(); await refresh(); go('sets'); notice('カードセットを保存しました。'); break;
    }
  }
}
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage-conflict', () => notice('別のタブでデータが更新されました。再読み込みしてね。'));
function speechMarkup() {
  return `<div class="speech-tools">${button('🎙 音声で入力', 'speech-start', 'small', speech.supported ? '' : 'disabled')}${button('中止', 'speech-stop', 'small', 'hidden')}<p id="speech-status" role="status">${speech.supported ? 'キーボードの音声入力も使えるよ。' : 'このブラウザでは手入力してね。キーボードの音声入力も使えます。'}</p></div><p class="speech-note">音声入力はブラウザ事業者の外部サービスで処理される場合があります。勝敗の判定には使いません。</p>`;
}
function startSpeech() {
  const input = app.querySelector('#character-name');
  if (!input || game.status !== 'naming') return;
  speech.start({
    onText: text => { if (input.isConnected) { input.value = text; input.dispatchEvent(new Event('input', { bubbles:true })); } },
    onState: (active, message) => {
      if (!input.isConnected) return;
      app.querySelector('[data-action="speech-start"]').disabled = active;
      app.querySelector('[data-action="speech-stop"]').hidden = !active;
      app.querySelector('#speech-status').textContent = message;
      app.querySelector('.speech-tools').classList.toggle('listening', active);
    }
  });
}
function stopSpeech() { speech.cancel('音声入力を中止しました。手入力で続けられるよ。'); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeech(); });
window.addEventListener('pagehide', stopSpeech);
