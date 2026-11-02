import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Agent } from '@hameau/shared';
import { theftUrge } from '../sim/daily';

const who = (honesty: number, role: Agent['role'] = 'CITOYEN') => ({ role, personality: { honesty } }) as Agent;
const sated = { satiete: 0.8, pain: 2, pieces: 1 };

test('un vagabond a toujours envie de voler', () => {
  assert.ok(theftUrge(who(0.9, 'VOLEUR'), sated) >= 0.2);
});

test('un affamé malhonnête sans le sou vole', () => {
  assert.ok(theftUrge(who(0.4), { satiete: 0.2, pain: 0, pieces: 0 }) > 0.3);
});

test('un pauvre peu honnête, même rassasié, est tenté par la richesse des autres', () => {
  const urge = theftUrge(who(0.3), sated);
  assert.ok(urge > 0 && urge < 0.2, `envie ${urge}`);
});

test('un honnête ne vole pas, même pauvre', () => {
  assert.equal(theftUrge(who(0.9), { satiete: 0.2, pain: 0, pieces: 0 }), 0);
});

test('un malhonnête riche ne vole pas par envie', () => {
  assert.equal(theftUrge(who(0.3), { satiete: 0.8, pain: 2, pieces: 30 }), 0);
});
