export type RoverStatus = "ready" | "charging";
export type OrderStatus = "available" | "delivered";
export type GameStatus = "playing" | "won" | "lost";

export interface Zone {
  id: string;
  name: string;
  terrain: string;
  x: number;
  y: number;
  distance: number;
  energyFactor: number;
  speedFactor: number;
  risk: number;
}

export interface Rover {
  id: string;
  name: string;
  note: string;
  battery: number;
  capacity: number;
  consumption: number;
  speed: number;
  status: RoverStatus;
}

export interface Order {
  id: string;
  title: string;
  destinationId: string;
  cargo: string;
  weight: number;
  reward: number;
  deadlineHours: number;
  riskBonus: number;
  status: OrderStatus;
}

export interface Delivery {
  id: string;
  day: number;
  orderId: string;
  roverId: string;
  energySpent: number;
  payout: number;
  incident: boolean;
}

export interface GameEvent {
  id: string;
  day: number;
  text: string;
  tone: "info" | "success" | "warning";
}

export interface GameState {
  version: 1;
  day: number;
  credits: number;
  status: GameStatus;
  rovers: Rover[];
  orders: Order[];
  deliveries: Delivery[];
  events: GameEvent[];
}

export interface DeliveryEstimate {
  canDispatch: boolean;
  energy: number;
  duration: number;
  risk: number;
  reasons: string[];
}

export interface DeliveryResult {
  state: GameState;
  error?: string;
  outcome?: {
    payout: number;
    energySpent: number;
    incident: boolean;
    message: string;
  };
}

export const MAX_DAYS = 5;
export const TARGET_CREDITS = 900;
export const BATTERY_RESERVE = 8;
export const DAILY_RECHARGE = 38;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateDelivery(
  order: Order,
  rover: Rover,
  zone: Zone,
): DeliveryEstimate {
  const weightLoad = order.weight / rover.capacity;
  const weightFactor = 1 + weightLoad * 0.35;
  const energy = Math.ceil(
    zone.distance * 2 * rover.consumption * weightFactor * zone.energyFactor,
  );
  const duration = Math.ceil(
    (zone.distance * 2) / (rover.speed * zone.speedFactor),
  );
  const risk = clamp(zone.risk + order.riskBonus, 5, 60);
  const reasons: string[] = [];

  if (order.status !== "available") reasons.push("заказ уже выполнен");
  if (rover.status !== "ready") reasons.push("ровер заряжается");
  if (order.weight > rover.capacity) {
    reasons.push(`груз ${order.weight} кг, лимит ровера ${rover.capacity} кг`);
  }
  if (rover.battery < energy + BATTERY_RESERVE) {
    reasons.push(
      `нужно ${energy + BATTERY_RESERVE}% батареи с резервом, доступно ${rover.battery}%`,
    );
  }
  if (duration > order.deadlineHours) {
    reasons.push(
      `маршрут займёт ${duration} ч, срок заказа ${order.deadlineHours} ч`,
    );
  }

  return {
    canDispatch: reasons.length === 0,
    energy,
    duration,
    risk,
    reasons,
  };
}

export function resolveDelivery(
  state: GameState,
  orderId: string,
  roverId: string,
  zones: Zone[],
  random: () => number = Math.random,
): DeliveryResult {
  if (state.status !== "playing") {
    return { state, error: "Игра уже завершена" };
  }

  const order = state.orders.find((item) => item.id === orderId);
  const rover = state.rovers.find((item) => item.id === roverId);
  const zone = zones.find((item) => item.id === order?.destinationId);

  if (!order || !rover || !zone) {
    return { state, error: "Не удалось найти данные доставки" };
  }

  const estimate = calculateDelivery(order, rover, zone);
  if (!estimate.canDispatch) {
    return { state, error: estimate.reasons[0] ?? "Доставка недоступна" };
  }

  const incident = random() < estimate.risk / 100;
  const extraEnergy = incident ? 5 : 0;
  const energySpent = estimate.energy + extraEnergy;
  const payout = Math.round(order.reward * (incident ? 0.75 : 1));
  const nextBattery = Math.max(0, rover.battery - energySpent);
  const deliveryNumber = state.deliveries.length + 1;
  const eventNumber = state.events.length + 1;
  const message = incident
    ? `${rover.name}: пробуксовка на реголите. Доставка выполнена, награда снижена.`
    : `${rover.name} доставил груз в «${zone.name}» без происшествий.`;

  return {
    state: {
      ...state,
      credits: state.credits + payout,
      rovers: state.rovers.map((item) =>
        item.id === rover.id
          ? {
              ...item,
              battery: nextBattery,
              status: nextBattery < 25 ? "charging" : "ready",
            }
          : item,
      ),
      orders: state.orders.map((item) =>
        item.id === order.id ? { ...item, status: "delivered" } : item,
      ),
      deliveries: [
        ...state.deliveries,
        {
          id: `delivery-${deliveryNumber}`,
          day: state.day,
          orderId: order.id,
          roverId: rover.id,
          energySpent,
          payout,
          incident,
        },
      ],
      events: [
        {
          id: `event-${eventNumber}`,
          day: state.day,
          text: message,
          tone: incident ? "warning" : "success",
        },
        ...state.events,
      ],
    },
    outcome: { payout, energySpent, incident, message },
  };
}

export function advanceDay(state: GameState): GameState {
  if (state.status !== "playing") return state;

  if (state.day >= MAX_DAYS) {
    const won = state.credits >= TARGET_CREDITS;
    return {
      ...state,
      status: won ? "won" : "lost",
      events: [
        {
          id: `event-${state.events.length + 1}`,
          day: state.day,
          text: won
            ? `Смена завершена: база заработала ${state.credits} кредитов.`
            : `Смена завершена: до цели не хватило ${TARGET_CREDITS - state.credits} кредитов.`,
          tone: won ? "success" : "warning",
        },
        ...state.events,
      ],
    };
  }

  const nextDay = state.day + 1;
  return {
    ...state,
    day: nextDay,
    rovers: state.rovers.map((rover) => ({
      ...rover,
      battery: Math.min(100, rover.battery + DAILY_RECHARGE),
      status: "ready",
    })),
    events: [
      {
        id: `event-${state.events.length + 1}`,
        day: nextDay,
        text: `День ${nextDay}. Роверы получили по ${DAILY_RECHARGE}% заряда.`,
        tone: "info",
      },
      ...state.events,
    ],
  };
}

export function isSavedGame(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return (
    candidate.version === 1 &&
    typeof candidate.day === "number" &&
    typeof candidate.credits === "number" &&
    Array.isArray(candidate.rovers) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.deliveries) &&
    Array.isArray(candidate.events)
  );
}
