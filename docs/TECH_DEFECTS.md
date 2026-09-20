# Технические дефекты (main @ fbd1cf9)

Плейтест локального `main` (`?fast`, Chromium headless desktop + Pixel/iPhone), плюс точечный разбор UI/engine после закрытия #21–#24.  
Только техника (жизненный цикл, a11y, perf, устойчивость). Контент/нарратив — в [PLAYTEST_ISSUES.md](./PLAYTEST_ISSUES.md).

Статус: 🔴 открыто · 🟡 частично / спорно.

---

## 🔴 P1 — Концовка не модальна (в отличие от досье)

**Наблюдение.** `#endingScreen` / `.ending` имеет `role="dialog"`, но:
- нет `aria-modal="true"`;
- `.phone-surface` не получает `inert`;
- фокус остаётся на поле «Сообщение» под оверлеем;
- `Escape` концовку не закрывает (для досье — закрывает).

**Как воспроизвести.** В консоли: выставить `S.ending` на любой id из `ENDINGS`, `emit()` → Tab/focus в input → Esc.

**Почему важно.** После #22 досье сделали полноценным модалом (`useModal` + `inert`). Концовка — такой же блокирующий слой (z-index 45), но без того же контракта → клавиатурный доступ к чату/композеру под диалогом.

**Что делать.** Тот же паттерн, что у `Sheet`: `useModal`, `aria-modal`, `inert` на остальной поверхности (или вынести ending из `phone-surface` рядом с sheet), Esc → «Играть дальше» или no-op с фокус-трапом.

---

## 🔴 P1 — «Скопировать великую отмазку» молчит при отказе clipboard

**Наблюдение.** `navigator.clipboard.writeText(...).then(() => game.flash('Скопировано'))` без `.catch`. При reject (denied / insecure context) тост не появляется, ошибка глотается.

**Как воспроизвести.** На экране payday-концовки с `#copyExcuse` подменить `clipboard.writeText` на `Promise.reject` и нажать кнопку.

**Что делать.** `.catch` → тост «Не удалось скопировать» и/или fallback через `textarea` + `execCommand('copy')`.

---

## 🟡 P2 — Экран «Телефон сел» без диалоговой семантики

**Наблюдение.** `#deadScreen` перекрывает UI (z-index 40), кнопки выбора disabled, input locked — ок по поведению. Но нет `role="dialog"` / `aria-modal`, нет `inert`, нет перевода фокуса на «Поставить на зарядку».

**Что делать.** Либо лёгкий a11y-паритет с ending/sheet (фокус на `#chargeBtn`, `aria-modal`), либо явно пометить как `role="alert"` / `aria-live` без претензии на dialog.

---

## 🟡 P2 — `prefers-reduced-motion` почти не соблюдается

**Наблюдение.** В CSS reduce отключает только jitter «?» у locked-choices. Живыми остаются: `moo`, `pop`, typing blink, `feel-shake|dim|sorry|cow`, notif и т.д.

**Что делать.** В том же `@media (prefers-reduced-motion: reduce)` обнулить/сократить остальные animation/transition на `.phone`.

---

## 🟡 P2 — Живая лента не ограничена (в RAM)

**Наблюдение.** В save пишутся последние 150 сообщений (`state.ts`), на экране история растёт без потолка. После инжекта сотен сообщений UI жив, но это сознательный trade-off #24.

**Риск.** Длинная сессия без reload → рост DOM + память (даже с memo/dirtyFrom).

**Что делать.** Отдельное решение: мягкий cap live-ленты / виртуализация / «архив выше» — не чинить молча в рамках старых issue.

---

## 🟡 P3 — Residual O(N) reconcile у родителя MessageList

**Наблюдение.** Sync/creation после #28 — O(Δ) (`msgsDirtyFrom`, `touched===1`). React всё ещё получает массив из N закэшированных children при append.

**Статус.** Зафиксировано ревьюером как серая зона критерия #24; на merge сошлись на creation/sync. Имеет смысл только если на слабых телефонах снова упрёмся в frame time.

**Что делать.** Чанки или виртуализация — отдельный issue, не регрессия.

---

## Проверено и не дефект

| Проверка | Результат |
| --- | --- |
| Reset mid-turn (`dispose`) | Старый `pendingTimers===0`, `disposed===true`; новый инстанс независим |
| Параллельный `send` пока busy | Лишние вызовы отбрасываются |
| Досье | `aria-modal`, `inert`, focus trap, Esc — ок |
| Unread после scroll-up + incoming | Кнопка появляется |
| Mobile input font | 16px (iPhone/Pixel); desktop 15px — ожидаемо |
| Landscape + touch media | fullscreen/padding media срабатывает в Playwright Pixel |
| Console / pageerror в короткой партии | Пусто |
| Save key `alik-save-v4` | Пишется, reload восстанавливает ход |

---

## Метод

- `main` @ `fbd1cf9` (после merge #27/#28), `npm run dev`, `?fast`
- Playwright Chromium headless: desktop 1280×800, Pixel 7, iPhone 12
- Форс UI: `S.ending`, `die()`, clipboard mock, bulk `notifyMsgs`

Дата прогона: 2026-09-20.
