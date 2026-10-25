const toBlob = (canvas, quality = .88) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした。')), 'image/jpeg', quality));
async function decode(blob) {
  // Modern Safari/Chrome honor EXIF here. Do not apply rotation twice.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* Native image fallback. */ }
  }
  const url = URL.createObjectURL(blob);
  try { const image = new Image(); image.src = url; await image.decode(); return image; }
  catch { throw new Error('この画像を読めませんでした。HEIC/HEIFは写真アプリでJPEGに変換するか、JPEG・PNG・WebPを選んでね。'); }
  finally { URL.revokeObjectURL(url); }
}
export async function normalizeImage(file) {
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '') && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('JPEG・PNG・WebPの画像を選んでね。HEIC/HEIFは読める端末でのみ使えます。');
  const image = await decode(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await toBlob(canvas);
  } finally { image.close?.(); }
}
export async function cropImage(blob, label = 'カードの形を決めよう') {
  const image = await decode(blob);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'crop-dialog';
    dialog.innerHTML = `<div class="dialog-body"><h2></h2><p class="fine">絵をドラッグして位置を調整。スライダーで拡大できるよ。</p><canvas width="640" height="640" aria-label="正方形の切り抜き範囲"></canvas><label class="crop-label">拡大率<input type="range" min="1" max="4" step="0.01" value="1" aria-label="拡大率"></label><div class="crop-position"><label>左右<input type="range" min="-1" max="1" step="0.01" value="0" aria-label="左右の位置"></label><label>上下<input type="range" min="-1" max="1" step="0.01" value="0" aria-label="上下の位置"></label></div><button type="button" class="secondary wide" id="rotate-image">↻ 90度回転</button><p class="crop-error" role="alert"></p><div class="dialog-actions"><button type="button" class="primary" id="crop-save">この形にする</button><button type="button" class="secondary" id="crop-cancel">この画像をスキップ</button></div></div>`;
    dialog.querySelector('h2').textContent = label; document.body.append(dialog); dialog.showModal();
    const canvas = dialog.querySelector('canvas'), zoomInput = dialog.querySelector('[aria-label="拡大率"]');
    const xInput = dialog.querySelector('[aria-label="左右の位置"]'), yInput = dialog.querySelector('[aria-label="上下の位置"]');
    let rotation = 0, zoom = 1, x = 0, y = 0, drag = null, output = null, working = false;
    function geometry() {
      const width = rotation % 180 ? image.height : image.width, height = rotation % 180 ? image.width : image.height;
      const scale = Math.max(640 / width, 640 / height) * zoom;
      return { scale, maxX: Math.max(0, (width * scale - 640) / 2), maxY: Math.max(0, (height * scale - 640) / 2) };
    }
    function draw(target = canvas) {
      const g = geometry(); x = Math.max(-g.maxX, Math.min(g.maxX, x)); y = Math.max(-g.maxY, Math.min(g.maxY, y));
      xInput.value = g.maxX ? x / g.maxX : 0; yInput.value = g.maxY ? y / g.maxY : 0;
      const ctx = target.getContext('2d'); ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, target.width, target.height);
      ctx.scale(target.width / 640, target.height / 640); ctx.translate(320 + x, 320 + y); ctx.rotate(rotation * Math.PI / 180); ctx.scale(g.scale, g.scale);
      ctx.drawImage(image, -image.width / 2, -image.height / 2); ctx.restore();
    }
    zoomInput.oninput = () => { zoom = Number(zoomInput.value); draw(); };
    xInput.oninput = () => { x = Number(xInput.value) * geometry().maxX; draw(); };
    yInput.oninput = () => { y = Number(yInput.value) * geometry().maxY; draw(); };
    canvas.onpointerdown = event => { drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = event => { if (!drag || drag.id !== event.pointerId) return; const scale = 640 / canvas.getBoundingClientRect().width; x += (event.clientX - drag.x) * scale; y += (event.clientY - drag.y) * scale; drag.x = event.clientX; drag.y = event.clientY; draw(); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    dialog.querySelector('#rotate-image').onclick = () => { rotation = (rotation + 90) % 360; x = y = 0; draw(); };
    dialog.querySelector('#crop-cancel').onclick = () => { if (!working) dialog.close(); };
    dialog.querySelector('#crop-save').onclick = async () => {
      if (working) return; working = true;
      try { const result = document.createElement('canvas'); result.width = result.height = 1024; draw(result); output = await toBlob(result); dialog.close(); }
      catch (error) { dialog.querySelector('.crop-error').textContent = error.message; }
      finally { working = false; }
    };
    dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
    dialog.addEventListener('close', () => { image.close?.(); dialog.remove(); resolve(output); }); draw();
  });
}
