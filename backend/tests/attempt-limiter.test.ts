import assert from "node:assert/strict";
import test from "node:test";
import { AttemptLimiter } from "../src/domain/attempt-limiter.js";

function createClock(start = 1_000_000) {
  let current = start;

  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

test("permite até o máximo de tentativas e bloqueia a seguinte", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({ maxAttempts: 3, windowMs: 60_000, now: clock.now });

  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, true);

  const blocked = limiter.hit("a");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test("o tempo de espera diminui conforme a janela passa", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({ maxAttempts: 1, windowMs: 60_000, now: clock.now });

  limiter.hit("a");
  clock.advance(20_500);

  assert.equal(limiter.hit("a").retryAfterSeconds, 40);
});

test("tentativas bloqueadas não prolongam a janela", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({ maxAttempts: 1, windowMs: 60_000, now: clock.now });

  limiter.hit("a");
  for (let i = 0; i < 50; i += 1) {
    limiter.hit("a");
  }

  clock.advance(60_000);
  assert.equal(limiter.hit("a").allowed, true);
});

test("a janela zera depois do prazo", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({ maxAttempts: 2, windowMs: 60_000, now: clock.now });

  limiter.hit("a");
  limiter.hit("a");
  assert.equal(limiter.hit("a").allowed, false);

  clock.advance(60_000);
  assert.equal(limiter.hit("a").allowed, true);
});

test("chaves diferentes não interferem entre si", () => {
  const limiter = new AttemptLimiter({ maxAttempts: 1, windowMs: 60_000 });

  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, false);
  assert.equal(limiter.hit("b").allowed, true);
});

test("release devolve uma tentativa e reset apaga a chave", () => {
  const limiter = new AttemptLimiter({ maxAttempts: 2, windowMs: 60_000 });

  limiter.hit("a");
  limiter.hit("a");
  limiter.release("a");
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, false);

  limiter.reset("a");
  assert.equal(limiter.size, 0);
  assert.equal(limiter.hit("a").allowed, true);
});

test("release de uma chave inexistente não causa erro", () => {
  const limiter = new AttemptLimiter({ maxAttempts: 2, windowMs: 60_000 });

  limiter.release("nunca-usada");
  assert.equal(limiter.size, 0);
});

test("não guarda mais chaves do que o limite de memória", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
    maxEntries: 100,
    now: clock.now,
  });

  for (let i = 0; i < 1_000; i += 1) {
    limiter.hit(`chave-${i}`);
  }

  assert.ok(limiter.size <= 100, `tamanho ${limiter.size}`);
});

test("remove primeiro as chaves vencidas ao liberar espaço", () => {
  const clock = createClock();
  const limiter = new AttemptLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
    maxEntries: 3,
    now: clock.now,
  });

  limiter.hit("antiga-1");
  limiter.hit("antiga-2");
  clock.advance(30_000);
  limiter.hit("recente");
  clock.advance(31_000);

  limiter.hit("nova");

  assert.equal(limiter.size, 2);
});
