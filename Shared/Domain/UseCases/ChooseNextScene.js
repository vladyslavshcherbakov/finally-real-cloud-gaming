export function chooseNextScene(scenes, previousSceneId, random) {
  const otherScenes = scenes.filter((scene) => scene.id !== previousSceneId);
  const candidates = otherScenes.length > 0 ? otherScenes : scenes;
  return candidates[Math.floor(random() * candidates.length)];
}
