"use client";

import { useEffect, useState } from "react";
import { createInitialGame, ZONES } from "./game-data";
import {
  advanceDay,
  BATTERY_RESERVE,
  calculateDelivery,
  isSavedGame,
  MAX_DELIVERIES_PER_DAY,
  MAX_DAYS,
  resolveDelivery,
  TARGET_CREDITS,
  type GameState,
  type Order,
} from "./game";

const STORAGE_KEY = "moon-courier-crisis:v2";

function urgencyLabel(order: Order, currentDay: number) {
  if (order.status === "delivered") return "Выполнен";
  if (order.status === "expired") return "Просрочен";
  const daysLeft = order.expiresOnDay - currentDay;
  if (daysLeft === 0) return "Последний день";
  if (daysLeft === 1) return "До завтра";
  return `До дня ${order.expiresOnDay}`;
}

function riskLabel(risk: number) {
  if (risk >= 40) return "Высокий";
  if (risk >= 24) return "Средний";
  return "Низкий";
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default function GameBoard() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [selectedOrderId, setSelectedOrderId] = useState("order-1");
  const [selectedRoverId, setSelectedRoverId] = useState("spark");
  const [storageReady, setStorageReady] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let restored: GameState | undefined;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (isSavedGame(saved)) restored = saved;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    queueMicrotask(() => {
      if (restored) {
        setGame(restored);
        const firstAvailableOrder = restored.orders.find(
          (order) => order.status === "available",
        );
        if (firstAvailableOrder) setSelectedOrderId(firstAvailableOrder.id);
      }
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, storageReady]);

  const selectedOrder =
    game.orders.find((order) => order.id === selectedOrderId) ?? game.orders[0];
  const selectedRover =
    game.rovers.find((rover) => rover.id === selectedRoverId) ?? game.rovers[0];
  const selectedZone = ZONES.find(
    (zone) => zone.id === selectedOrder.destinationId,
  )!;
  const estimate = calculateDelivery(selectedOrder, selectedRover, selectedZone);
  const progress = Math.min(100, (game.credits / TARGET_CREDITS) * 100);
  const maxCapacity = Math.max(...game.rovers.map((rover) => rover.capacity));
  const deliveriesToday = game.deliveries.filter(
    (delivery) => delivery.day === game.day,
  ).length;
  const dailyLimitReached = deliveriesToday >= MAX_DELIVERIES_PER_DAY;
  const canDispatch = estimate.canDispatch && !dailyLimitReached;
  const blockReason = dailyLimitReached
    ? `Лимит базы на сегодня: ${MAX_DELIVERIES_PER_DAY} рейса`
    : estimate.reasons[0];

  const routeX = selectedZone.x - 50;
  const routeY = selectedZone.y - 52;
  const routeStyle = {
    width: `${Math.sqrt(routeX * routeX + routeY * routeY)}%`,
    transform: `rotate(${Math.atan2(routeY, routeX) * (180 / Math.PI)}deg)`,
  };

  function chooseZone(zoneId: string) {
    const order =
      game.orders.find(
        (item) => item.destinationId === zoneId && item.status === "available",
      ) ?? game.orders.find((item) => item.destinationId === zoneId);
    if (order) {
      setSelectedOrderId(order.id);
      setFeedback(null);
    }
  }

  function dispatch() {
    const result = resolveDelivery(
      game,
      selectedOrder.id,
      selectedRover.id,
      ZONES,
    );
    if (result.error) {
      setFeedback(result.error);
      return;
    }

    setGame(result.state);
    setFeedback(
      result.outcome?.incident
        ? `Доставлено с происшествием: +${result.outcome.payout} кр., −${result.outcome.energySpent}% батареи`
        : `Доставлено: +${result.outcome?.payout} кр., −${result.outcome?.energySpent}% батареи`,
    );

    const nextOrder = result.state.orders.find(
      (order) => order.status === "available" && order.weight <= maxCapacity,
    );
    if (nextOrder) setSelectedOrderId(nextOrder.id);
  }

  function nextDay() {
    const next = advanceDay(game);
    setGame(next);
    const nextAvailableOrder = next.orders.find(
      (order) => order.status === "available" && order.weight <= maxCapacity,
    );
    if (nextAvailableOrder) setSelectedOrderId(nextAvailableOrder.id);
    const newlyExpired = next.orders.filter(
      (order, index) =>
        order.status === "expired" && game.orders[index]?.status === "available",
    ).length;
    setFeedback(
      next.status === "playing"
        ? `Начался день ${next.day}. Батареи пополнены.${newlyExpired ? ` Просрочено заказов: ${newlyExpired}.` : ""}`
        : next.status === "won"
          ? "Цель выполнена. База закончила смену в плюсе!"
          : "Смена завершена — попробуйте другой порядок заказов.",
    );
  }

  function resetGame() {
    if (!window.confirm("Начать новую смену? Текущий прогресс будет удалён.")) {
      return;
    }
    setGame(createInitialGame());
    setSelectedOrderId("order-1");
    setSelectedRoverId("spark");
    setFeedback(null);
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">MC</span>
          <div>
            <p className="eyebrow">Лунная служба снабжения</p>
            <h1>Moon Courier Crisis</h1>
          </div>
        </div>

        <div className="mission-stats" aria-label="Статус игры">
          <div className="day-chip">
            <span>День</span>
            <strong>{game.day}/{MAX_DAYS}</strong>
          </div>
          <div className="day-chip">
            <span>Рейсы</span>
            <strong>{deliveriesToday}/{MAX_DELIVERIES_PER_DAY}</strong>
          </div>
          <div className="credits-block">
            <div className="credits-line">
              <span>Кредиты</span>
              <strong>{formatCredits(game.credits)}</strong>
              <small>/ {TARGET_CREDITS}</small>
            </div>
            <div className="goal-track" aria-label={`Прогресс цели ${Math.round(progress)}%`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={nextDay} disabled={game.status !== "playing"}>
            {game.day === MAX_DAYS ? "Завершить игру" : "Следующий день"}
          </button>
          <button className="icon-button" type="button" onClick={resetGame} aria-label="Сбросить игру">↻</button>
        </div>
      </header>

      {game.status !== "playing" && (
        <section className={`game-result ${game.status}`} aria-live="polite">
          <div>
            <p className="eyebrow">Смена завершена</p>
            <h2>{game.status === "won" ? "База удержалась" : "Цель не достигнута"}</h2>
          </div>
          <p>
            Итог: <strong>{formatCredits(game.credits)} кредитов</strong>. Выполнено доставок: {game.deliveries.length}.
          </p>
          <button type="button" className="primary-button compact" onClick={resetGame}>Сыграть ещё раз</button>
        </section>
      )}

      <section className="workspace" aria-label="Игровое поле">
        <aside className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Очередь базы</p>
              <h2>Заказы</h2>
            </div>
            <span className="count-badge">{game.orders.filter((order) => order.status === "available").length}</span>
          </div>

          <div className="order-list">
            {game.orders.map((order) => {
              const zone = ZONES.find((item) => item.id === order.destinationId)!;
              const permanentlyImpossible = order.weight > maxCapacity;
              const selected = order.id === selectedOrder.id;
              return (
                <button
                  type="button"
                  key={order.id}
                  className={`order-card ${selected ? "selected" : ""} ${order.status !== "available" ? "done" : ""}`}
                  onClick={() => {
                    setSelectedOrderId(order.id);
                    setFeedback(null);
                  }}
                >
                  <span className="order-topline">
                    <span className={`urgency urgency-${order.status === "expired" || (order.status === "available" && order.expiresOnDay <= game.day) ? "hot" : "normal"}`}>
                      {urgencyLabel(order, game.day)}
                    </span>
                    <span className="order-reward">+{order.reward} кр.</span>
                  </span>
                  <strong>{order.title}</strong>
                  <span className="destination">{zone.name} · {zone.distance} км</span>
                  <span className="order-meta">
                    <span>{order.weight} кг</span>
                    <span>{order.deadlineHours} ч</span>
                    <span>до дня {order.expiresOnDay}</span>
                    <span>риск {zone.risk + order.riskBonus}%</span>
                  </span>
                  {permanentlyImpossible && order.status === "available" && (
                    <span className="impossible-note">Не увезёт ни один ровер</span>
                  )}
                  {order.status === "delivered" && <span className="done-note">✓ Доставлено</span>}
                  {order.status === "expired" && <span className="expired-note">Срок истёк</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="map-panel" aria-label="Карта Луны">
          <div className="map-toolbar">
            <div>
              <p className="eyebrow">Сектор Море Дождей</p>
              <h2>Карта маршрутов</h2>
            </div>
            <div className="map-legend">
              <span><i className="legend-dot safe" /> низкий риск</span>
              <span><i className="legend-dot medium" /> средний</span>
              <span><i className="legend-dot high" /> высокий</span>
            </div>
          </div>

          <div className="moon-map">
            <div className="crater crater-one" />
            <div className="crater crater-two" />
            <div className="crater crater-three" />
            <div className="grid-lines" />
            <div className="route-line" style={routeStyle} />
            <div className="route-pulse" style={{ left: `${selectedZone.x}%`, top: `${selectedZone.y}%` }} />

            <div className="base-marker" style={{ left: "50%", top: "52%" }}>
              <span className="base-symbol">B</span>
              <span className="map-label"><strong>База «Селена»</strong><small>центр снабжения</small></span>
            </div>

            {ZONES.map((zone) => {
              const risk = zone.risk >= 30 ? "high" : zone.risk >= 18 ? "medium" : "safe";
              const active = zone.id === selectedZone.id;
              return (
                <button
                  type="button"
                  key={zone.id}
                  className={`zone-marker ${risk} ${active ? "active" : ""}`}
                  style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                  onClick={() => chooseZone(zone.id)}
                  aria-label={`${zone.name}, риск ${zone.risk}%`}
                >
                  <span className="zone-dot" />
                  <span className="map-label"><strong>{zone.name}</strong><small>{zone.terrain}</small></span>
                </button>
              );
            })}

            <div className="map-coordinate">47.2°N / 31.4°W</div>
          </div>

          <div className="route-summary">
            <div><span>Маршрут</span><strong>База → {selectedZone.name}</strong></div>
            <div><span>Туда и обратно</span><strong>{(selectedZone.distance * 2).toFixed(1)} км</strong></div>
            <div><span>Местность</span><strong>{selectedZone.terrain}</strong></div>
            <div><span>Базовый риск</span><strong>{selectedZone.risk}%</strong></div>
          </div>
        </section>

        <aside className="panel dispatch-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Подготовка рейса</p>
              <h2>Выберите ровер</h2>
            </div>
            <span className="step-badge">2/2</span>
          </div>

          <div className="selected-order-mini">
            <span>Выбранный заказ</span>
            <strong>{selectedOrder.title}</strong>
            <small>{selectedOrder.cargo} · {selectedOrder.weight} кг</small>
          </div>

          <div className="rover-list">
            {game.rovers.map((rover) => {
              const roverEstimate = calculateDelivery(selectedOrder, rover, selectedZone);
              const chosen = rover.id === selectedRover.id;
              const roverCanDispatch = roverEstimate.canDispatch && !dailyLimitReached;
              const availabilityLabel = dailyLimitReached
                ? "лимит"
                : rover.status === "resting"
                  ? "отдыхает"
                  : roverCanDispatch
                    ? "готов"
                    : "нельзя";
              return (
                <button
                  type="button"
                  key={rover.id}
                  className={`rover-card ${chosen ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedRoverId(rover.id);
                    setFeedback(null);
                  }}
                >
                  <span className="rover-card-top">
                    <span className="rover-avatar" aria-hidden="true">{rover.name.slice(0, 1)}</span>
                    <span className="rover-name"><strong>{rover.name}</strong><small>{rover.note}</small></span>
                    <span className={`availability ${roverCanDispatch ? "ok" : "no"}`}>
                      {availabilityLabel}
                    </span>
                  </span>
                  <span className="battery-line">
                    <span><small>Батарея</small><strong>{rover.battery}%</strong></span>
                    <span className="battery-track"><i style={{ width: `${rover.battery}%` }} /></span>
                  </span>
                  <span className="rover-specs">
                    <span>до {rover.capacity} кг</span>
                    <span>{rover.speed} км/ч</span>
                    <span>расход ×{rover.consumption}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="forecast-card">
            <div className="forecast-heading">
              <span>Прогноз рейса</span>
              <strong className={`risk-text ${estimate.risk >= 40 ? "high" : estimate.risk >= 24 ? "medium" : "safe"}`}>
                {riskLabel(estimate.risk)} риск
              </strong>
            </div>
            <div className="forecast-grid">
              <div><span>Батарея</span><strong>−{estimate.energy}%</strong></div>
              <div><span>Время</span><strong>{estimate.duration} ч</strong></div>
              <div><span>Риск</span><strong>{estimate.risk}%</strong></div>
              <div><span>Награда</span><strong>{selectedOrder.reward} кр.</strong></div>
            </div>
            {!canDispatch && (
              <div className="block-reason">
                <strong>Рейс невозможен</strong>
                <span>{blockReason}</span>
              </div>
            )}
          </div>

          {feedback && <div className="feedback" role="status">{feedback}</div>}

          <button
            type="button"
            className="primary-button"
            disabled={!canDispatch || game.status !== "playing"}
            onClick={dispatch}
          >
            {canDispatch ? "Запустить доставку" : "Доставка недоступна"}
          </button>
          <p className="dispatch-hint">Один ровер выполняет один рейс в день. В расчёте оставлен резерв батареи {BATTERY_RESERVE}%.</p>
        </aside>
      </section>

      <section className="log-panel">
        <div className="log-title">
          <p className="eyebrow">Бортовой журнал</p>
          <h2>События смены</h2>
        </div>
        <div className="event-list">
          {game.events.slice(0, 4).map((event) => (
            <article className={`event event-${event.tone}`} key={event.id}>
              <span>День {event.day}</span>
              <p>{event.text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="game-footer">
        <span>Данные сохраняются в браузере автоматически</span>
        <span>Цель: заработать {TARGET_CREDITS} кредитов за {MAX_DAYS} дней</span>
      </footer>
    </main>
  );
}
