import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame, ZONES } from "../app/game-data.ts";
import {
  advanceDay,
  BATTERY_RESERVE,
  calculateDelivery,
  resolveDelivery,
  TARGET_CREDITS,
  type Order,
  type Zone,
} from "../app/game.ts";

test("heavy cargo consumes more battery", () => {
  const game = createInitialGame();
  const rover = game.rovers.find((item) => item.id === "atlas")!;
  const zone = ZONES.find((item) => item.id === "tycho")!;
  const lightOrder: Order = { ...game.orders[1], weight: 4 };
  const heavyOrder: Order = { ...game.orders[1], weight: 14 };

  const light = calculateDelivery(lightOrder, rover, zone);
  const heavy = calculateDelivery(heavyOrder, rover, zone);

  assert.ok(heavy.energy > light.energy);
});

test("cargo above rover capacity blocks dispatch", () => {
  const game = createInitialGame();
  const impossibleOrder = game.orders.find((item) => item.id === "order-6")!;
  const rover = game.rovers.find((item) => item.id === "atlas")!;
  const zone = ZONES.find((item) => item.id === impossibleOrder.destinationId)!;

  const estimate = calculateDelivery(impossibleOrder, rover, zone);

  assert.equal(estimate.canDispatch, false);
  assert.match(estimate.reasons.join(" "), /груз 26 кг/);
});

test("battery reserve is required before launch", () => {
  const game = createInitialGame();
  const order = game.orders[0];
  const rover = { ...game.rovers[0], battery: 10 };
  const zone = ZONES.find((item) => item.id === order.destinationId)!;

  const estimate = calculateDelivery(order, rover, zone);

  assert.equal(estimate.canDispatch, false);
  assert.match(estimate.reasons.join(" "), new RegExp(`с резервом`));
  assert.ok(estimate.energy + BATTERY_RESERVE > rover.battery);
});

test("rough terrain increases energy, duration and risk", () => {
  const game = createInitialGame();
  const order = { ...game.orders[0], deadlineHours: 20, riskBonus: 0 };
  const rover = game.rovers[0];
  const safeZone: Zone = {
    ...ZONES[0],
    distance: 6,
    energyFactor: 1,
    speedFactor: 1,
    risk: 8,
  };
  const roughZone: Zone = {
    ...safeZone,
    energyFactor: 1.35,
    speedFactor: 0.6,
    risk: 35,
  };

  const safe = calculateDelivery(order, rover, safeZone);
  const rough = calculateDelivery(order, rover, roughZone);

  assert.ok(rough.energy > safe.energy);
  assert.ok(rough.duration > safe.duration);
  assert.ok(rough.risk > safe.risk);
});

test("successful delivery updates order, rover, credits and history", () => {
  const game = createInitialGame();
  const result = resolveDelivery(game, "order-1", "spark", ZONES, () => 0.99);

  assert.equal(result.error, undefined);
  assert.equal(result.state.credits, 230);
  assert.equal(result.state.orders[0].status, "delivered");
  assert.ok(result.state.rovers[0].battery < game.rovers[0].battery);
  assert.equal(result.state.deliveries.length, 1);
  assert.equal(result.state.deliveries[0].incident, false);
});

test("route incident adds battery cost and reduces payout", () => {
  const game = createInitialGame();
  const safeResult = resolveDelivery(game, "order-1", "spark", ZONES, () => 0.99);
  const incidentResult = resolveDelivery(game, "order-1", "spark", ZONES, () => 0);

  assert.equal(incidentResult.state.credits, 173);
  assert.ok(
    incidentResult.state.deliveries[0].energySpent >
      safeResult.state.deliveries[0].energySpent,
  );
  assert.equal(incidentResult.state.deliveries[0].incident, true);
});

test("next day recharges rovers and the fifth day finishes the game", () => {
  const game = createInitialGame();
  const next = advanceDay({
    ...game,
    rovers: game.rovers.map((rover) => ({ ...rover, battery: 20 })),
  });

  assert.equal(next.day, 2);
  assert.equal(next.rovers[0].battery, 58);
  assert.equal(next.rovers[0].status, "ready");

  const finished = advanceDay({
    ...next,
    day: 5,
    credits: TARGET_CREDITS,
  });
  assert.equal(finished.status, "won");
});
