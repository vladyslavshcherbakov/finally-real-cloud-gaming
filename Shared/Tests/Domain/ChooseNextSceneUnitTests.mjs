import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseNextScene } from '../../Domain/UseCases/ChooseNextScene.js';

const scenes = [{ id: 'harbour' }, { id: 'forest' }];

test('nextScene_whenThereAreOtherScenes_isNeverThePreviousOne', () => {
  const alwaysFirst = () => 0;

  assert.equal(chooseNextScene(scenes, 'harbour', alwaysFirst).id, 'forest');
});

test('nextScene_whenThereIsOnlyOneScene_isThatScene', () => {
  assert.equal(chooseNextScene([{ id: 'harbour' }], 'harbour', Math.random).id, 'harbour');
});
