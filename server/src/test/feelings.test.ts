import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeling } from '@hameau/shared';

test('une estime se lit en mots et en visages', () => {
  assert.deepEqual([feeling(0.8).word, feeling(0.8).face], ['adore', '😍']);
  assert.equal(feeling(0.3).word, 'apprécie');
  assert.equal(feeling(0).word, 'neutre');
  assert.equal(feeling(0.1).word, 'neutre');
  assert.equal(feeling(-0.3).word, 'se méfie');
  assert.equal(feeling(-0.8).word, 'déteste');
});
