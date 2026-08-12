export type RoverStatus = "ready" | "resting";
export type OrderStatus = "available" | "delivered" | "expired";
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
  expiresOnDay: number;
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
  version: 2;
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
export const TARGET_CREDITS = 1100;
export const BATTERY_RESERVE = 8;
export const DAILY_RECHARGE = 38;
export const MAX_DELIVERIES_PER_DAY = 2;

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

  if (order.status === "delivered") reasons.push("заказ уже выполнен");
  if (order.status === "expired") reasons.push("срок заказа истёк");
  if (rover.status !== "ready") {
    reasons.push("ровер уже выполнил рейс сегодня");
  }
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

  if (state.day > order.expiresOnDay) {
    return { state, error: "Срок заказа истёк" };
  }

  const deliveriesToday = state.deliveries.filter(
    (delivery) => delivery.day === state.day,
  ).length;
  if (deliveriesToday >= MAX_DELIVERIES_PER_DAY) {
    return {
      state,
      error: `Лимит базы на сегодня: ${MAX_DELIVERIES_PER_DAY} рейса`,
    };
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
              status: "resting",
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
  const expiredOrders = state.orders.filter(
    (order) =>
      order.status === "available" && order.expiresOnDay < nextDay,
  );
  const expirationEvents: GameEvent[] = expiredOrders.length
    ? [
        {
          id: `event-${state.events.length + 2}`,
          day: nextDay,
          text: `Просрочено заказов: ${expiredOrders.length}. ${expiredOrders
            .map((order) => order.title)
            .join(", ")}.`,
          tone: "warning",
        },
      ]
    : [];

  return {
    ...state,
    day: nextDay,
    rovers: state.rovers.map((rover) => ({
      ...rover,
      battery: Math.min(100, rover.battery + DAILY_RECHARGE),
      status: "ready",
    })),
    orders: state.orders.map((order) =>
      order.status === "available" && order.expiresOnDay < nextDay
        ? { ...order, status: "expired" }
        : order,
    ),
    events: [
      {
        id: `event-${state.events.length + 1}`,
        day: nextDay,
        text: `День ${nextDay}. Роверы получили по ${DAILY_RECHARGE}% заряда.`,
        tone: "info",
      },
      ...expirationEvents,
      ...state.events,
    ],
  };
}

export function isSavedGame(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  const isNumber = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item);
  const isString = (item: unknown) => typeof item === "string";
  const isRover = (item: unknown): item is Rover => {
    if (!item || typeof item !== "object") return false;
    const rover = item as Partial<Rover>;
    return (
      isString(rover.id) &&
      isString(rover.name) &&
      isString(rover.note) &&
      isNumber(rover.battery) &&
      isNumber(rover.capacity) &&
      isNumber(rover.consumption) &&
      isNumber(rover.speed) &&
      (rover.status === "ready" || rover.status === "resting")
    );
  };
  const isOrder = (item: unknown): item is Order => {
    if (!item || typeof item !== "object") return false;
    const order = item as Partial<Order>;
    return (
      isString(order.id) &&
      isString(order.title) &&
      isString(order.destinationId) &&
      isString(order.cargo) &&
      isNumber(order.weight) &&
      isNumber(order.reward) &&
      isNumber(order.deadlineHours) &&
      isNumber(order.expiresOnDay) &&
      isNumber(order.riskBonus) &&
      ["available", "delivered", "expired"].includes(order.status ?? "")
    );
  };
  const isDelivery = (item: unknown): item is Delivery => {
    if (!item || typeof item !== "object") return false;
    const delivery = item as Partial<Delivery>;
    return (
      isString(delivery.id) &&
      isNumber(delivery.day) &&
      isString(delivery.orderId) &&
      isString(delivery.roverId) &&
      isNumber(delivery.energySpent) &&
      isNumber(delivery.payout) &&
      typeof delivery.incident === "boolean"
    );
  };
  const isEvent = (item: unknown): item is GameEvent => {
    if (!item || typeof item !== "object") return false;
    const event = item as Partial<GameEvent>;
    return (
      isString(event.id) &&
      isNumber(event.day) &&
      isString(event.text) &&
      ["info", "success", "warning"].includes(event.tone ?? "")
    );
  };

  return (
    candidate.version === 2 &&
    isNumber(candidate.day) &&
    isNumber(candidate.credits) &&
    ["playing", "won", "lost"].includes(candidate.status ?? "") &&
    Array.isArray(candidate.rovers) &&
    candidate.rovers.length > 0 &&
    candidate.rovers.every(isRover) &&
    Array.isArray(candidate.orders) &&
    candidate.orders.length > 0 &&
    candidate.orders.every(isOrder) &&
    Array.isArray(candidate.deliveries) &&
    candidate.deliveries.every(isDelivery) &&
    Array.isArray(candidate.events) &&
    candidate.events.every(isEvent)
  );
}
