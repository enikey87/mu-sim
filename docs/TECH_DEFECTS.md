# Технические дефекты (main @ 2b12557 + round2)

Плейтест `?fast`, Chromium headless (desktop + Pixel/iPhone).  
Только техника. Контент/нарратив — в [PLAYTEST_ISSUES.md](./PLAYTEST_ISSUES.md).

Статус: ✅ закрыто · 🟡 отложено (не регрессия).

Ссылки перепроверены на main @ f197b4d (2026-09-24, #111): номеров строк здесь нет, символы на месте; `flash`/`notify` по-прежнему в `Game`, но пишут в `game.ui` (`UiState`, #50).

---

## Закрыто в #29

| Было | Фикс |
| --- | --- |
| P1 концовка не модальна | `useModal` + `aria-modal` + `inert`; ending/dead вне `phone-surface` |
| P1 clipboard без `.catch` | `copyText` + toast ошибки / fallback |
| P2 dead без dialog | `role="dialog"` + `aria-modal` + `useModal` |
| P2 reduced-motion почти пустой | feel/moo/typing/locked `?` |
| P2 live-лента без потолка | `LIVE_RENDER_CAP` |

---

## Закрыто в round 2 (`feature/tech-defects-round2`)

| Было | Фикс |
| --- | --- |
| P2 тост под `inert` на ending/dead/sheet | `<Toast />` вне `phone-surface`, `z-index: 60` |
| P2 голосовое `role="button"` без клавиатуры | `tabIndex={0}` + Enter/Space |
| P2 reduced-motion: `.msg` / `.new-messages` pop | в тот же `@media reduce` |
| P3 `feel-*` не снимались после анимации | `animationend` → `classList.remove` |
| P3 mute без `aria-pressed` | `aria-label` вкл/выкл + `aria-pressed` |
| P1 тост/`notif` живут по game-clock (`?fast` ≈ 78 мс) | `flash`/`notify` на `window.setTimeout` (wall clock); clear в `dispose` |
| P2 досье + концовка = два `aria-modal` | closing sheet when `ending`/`dead` |

---

## 🟡 P3 — Residual O(N) reconcile у родителя MessageList

Creation/sync O(Δ) после #28. React-родитель всё ещё видит N children при append. Виртуализация — отдельно, если снова упрёмся в frame time.

---

## Проверено и не дефект (раунд 2, повтор после фиксов)

| Проверка | Результат |
| --- | --- |
| Ending/dead/sheet `aria-modal` + inert | ок |
| Clipboard reject → «Не удалось…», тост вне inert | ок |
| Esc closing ending; Esc не закрывает dead | ок |
| Unread после scroll-up + incoming | ок |
| LIVE_RENDER_CAP → ··· + ≤1000 DOM | ок |
| Double `requestSubmit` | один пузырь |
| Draft переживает sheet | ок |
| Mobile input ≥16px, нет h-overflow | ок |
| Voice focus + Enter | ок |
| feel-класс снимается на animationend | ок |
| Console/pageerror | пусто |
| Повторный прогон playtest после фиксов | **0 новых** |
| Раунд 3 (deep hunt: tab trap, mute persist, toast wall-clock, reduce anim, cap slide, landscape safe, job inert, 12–15 ходов) | **0 новых** |

---

## Метод

- `?fast`, `localStorage.clear()` между сценариями
- Playwright: 1280×800, Pixel 7, iPhone 12
- `scripts/playtest-tech.mjs`

Дата: 2026-09-20.
