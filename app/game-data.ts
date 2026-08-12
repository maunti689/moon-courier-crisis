import type { GameState, Order, Rover, Zone } from "./game";

export const ZONES: Zone[] = [
  { id: "relay", name: "Ретранслятор-7", terrain: "Пыльная равнина", x: 24, y: 28, distance: 4.8, energyFactor: 1.08, speedFactor: 0.92, risk: 12 },
  { id: "tycho", name: "Лагерь Тихо", terrain: "Ровное плато", x: 78, y: 25, distance: 6.2, energyFactor: 1, speedFactor: 1, risk: 8 },
  { id: "ridge", name: "Тихий хребет", terrain: "Каменистый склон", x: 76, y: 72, distance: 8.6, energyFactor: 1.18, speedFactor: 0.82, risk: 22 },
  { id: "crater", name: "Лаборатория Кеплер", terrain: "Кромка кратера", x: 18, y: 78, distance: 11.4, energyFactor: 1.35, speedFactor: 0.68, risk: 35 },
];

export const INITIAL_ROVERS: Rover[] = [
  { id: "spark", name: "Искра-3", note: "Быстрый разведчик", battery: 72, capacity: 14, consumption: 0.85, speed: 8.5, status: "ready" },
  { id: "atlas", name: "Атлас-2", note: "Тяжёлый грузовик", battery: 96, capacity: 24, consumption: 1.15, speed: 5.5, status: "ready" },
  { id: "mila", name: "Мила-1", note: "Экономичный курьер", battery: 100, capacity: 10, consumption: 0.72, speed: 7, status: "ready" },
];

export const INITIAL_ORDERS: Order[] = [
  { id: "order-1", title: "Аварийный комплект", destinationId: "relay", cargo: "Батареи и пайки", weight: 6, reward: 230, deadlineHours: 2, riskBonus: 10, status: "available" },
  { id: "order-2", title: "Ночная смена", destinationId: "tycho", cargo: "Рационы на трое суток", weight: 14, reward: 310, deadlineHours: 4, riskBonus: 2, status: "available" },
  { id: "order-3", title: "Связисты хребта", destinationId: "ridge", cargo: "Пайки и термопакеты", weight: 8, reward: 260, deadlineHours: 4, riskBonus: 4, status: "available" },
  { id: "order-4", title: "Геологи кратера", destinationId: "crater", cargo: "Вода и аварийные рационы", weight: 12, reward: 340, deadlineHours: 6, riskBonus: 8, status: "available" },
  { id: "order-5", title: "Дежурная бригада", destinationId: "relay", cargo: "Горячие рационы", weight: 4, reward: 190, deadlineHours: 3, riskBonus: 0, status: "available" },
  { id: "order-6", title: "Запас для буровой", destinationId: "crater", cargo: "Контейнер с пайками", weight: 26, reward: 520, deadlineHours: 8, riskBonus: 6, status: "available" },
];

export function createInitialGame(): GameState {
  return {
    version: 1,
    day: 1,
    credits: 0,
    status: "playing",
    rovers: INITIAL_ROVERS.map((rover) => ({ ...rover })),
    orders: INITIAL_ORDERS.map((order) => ({ ...order })),
    deliveries: [],
    events: [{ id: "event-1", day: 1, text: "Смена началась. Выберите заказ и подходящий ровер.", tone: "info" }],
  };
}
