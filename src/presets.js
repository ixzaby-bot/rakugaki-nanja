export async function loadPreset(existingIds = []) {
  const base = new URL('../assets/presets/', import.meta.url);
  const response = await fetch(new URL('manifest.json', base));
  if (!response.ok) throw new Error('プリセット一覧を読み込めませんでした。再読み込みしてね。');
  const manifest = await response.json();
  // A new manifest id installs a new immutable preset; existing games keep their images.
  if (existingIds.includes(manifest.id)) return null;
  const images = await Promise.all(manifest.images.map(async item => {
    const result = await fetch(new URL(item.file, base));
    if (!result.ok) throw new Error('プリセット画像を読み込めませんでした。');
    return { id: `preset-${manifest.id}-${item.id}`, blob: await result.blob() };
  }));
  return { set: { id: manifest.id, title: manifest.title, isPreset: true, characters: manifest.images.map((item, i) => ({ id: item.id, imageId: images[i].id, createdAt: new Date().toISOString() })), updatedAt: new Date().toISOString() }, images };
}
