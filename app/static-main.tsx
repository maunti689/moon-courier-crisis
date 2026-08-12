import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GameBoard from "./GameBoard";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Не найден корневой элемент приложения");
}

createRoot(root).render(
  <StrictMode>
    <GameBoard />
  </StrictMode>,
);
