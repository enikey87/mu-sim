# Preact вместо React: инвентаризация и замер

> **Статус:** реализовано (#1447) · пакет бут-загрузки #1443 → #1444 → #1446 → #1447

Цель задачи — снять с холодной загрузки React (`react` + `react-dom` + `scheduler`, ~32% бандла)
и оставить на его месте `preact/compat` при полном паритете поведения и вида.
Документ фиксирует инвентаризацию API (её задача требует **до** свапа), рецепт, протокол замера и
что вскрылось на паритете.

## Инвентаризация: что интерфейс берёт из React

`grep` по `src/` (14 файлов, 16 импортов) — весь рантайм-контакт с React.

| API | Где | Что значит для compat |
|---|---|---|
| `createRoot`, `StrictMode` | `src/main.tsx` | корень один, `render` без `hydrate`; `StrictMode` в compat = `Fragment` (двойного вызова инициализаторов нет — игра создаётся вне дерева, это остаётся верным) |
| `useState`, `useRef`, `useEffect`, `useLayoutEffect`, `useCallback`, `useMemo` | `App.tsx`, `Chat.tsx`, `Header.tsx`, `Input.tsx`, `Intro.tsx`, `Message.tsx`, `Overlays.tsx`, `Sheet.tsx`, `Review.tsx`, `DebugPanel.tsx`, `useModal.ts` | все хуки есть в `preact/hooks`, включая `useLayoutEffect` (в браузере — синхронный) |
| `useSyncExternalStore` | `Chat.tsx` (эпоха ленты), `DebugPanel.tsx` (версия), `useGame.ts` (подписка) | реализация compat поверх `options.__c`; расхождение в порядке обновлений вскрылось на прокрутке (см. ниже) |
| `createContext`, `useContext` | `useGame.ts` (`GameContext`), `Review.tsx` (заметки рецензента) | `createContext`/`useContext` compat; провайдер один, значение меняется редко |
| `memo` | `Message.tsx`, `Chat.tsx` (`MessageList`) | `memo` уважает `areEqual` по умолчанию; в проекте сравнивателя нет — совпадает |
| `Component`, `getDerivedStateFromError`, `componentDidCatch` | `App.tsx` (`class Crash`) | единственный классовый компонент — error boundary; `componentDidCatch` в compat есть |
| типы `ReactNode`, `ReactElement`, `RefObject`, `MouseEvent`, `PointerEvent`, `FormEvent` | `App.tsx`, `Chat.tsx`, `Sheet.tsx`, `Input.tsx`, `Message.tsx` | берутся из `@types/react` и остаются ими: тип-контракт не меняется |
| объектные `ref` | `App.tsx` (`.phone`), `Chat.tsx` (`.chat`), `Overlays.tsx` ×2, `Sheet.tsx`, `Review.tsx`, `Intro.tsx` | compat присваивает `.current`; функция-ref не используется |
| `createPortal`, `Suspense`, `lazy`, `forwardRef`, `flushSync`, `useId`, `useTransition`, `useDeferredValue`, `dangerouslySetInnerHTML`, `findDOMNode`, `Children` | — | **не используются**; портал и код-сплиттинг-примитивы вне периметра |
| `autoFocus` | — | **не поддерживается preact** (атрибут проставится, фокус никто не переставит) — не применять |

События (все — обычные нативные обработчики, без синтетической экзотики):
`onClick` (35), `onChange` (3 — текст и чекбокс `DebugPanel`), `onSubmit`, `onScroll`,
`onKeyDown`, `onContextMenu`, `onPointerDown/Move/Up/Cancel` (долгое нажатие в `Input`/`Message`).
Compat переводит `onChange` у `input`/`textarea` в `input`-событие так же, как React; `onScroll` и
указательные события вешаются нативно.

Атрибуты, за которые отвечает слой compat, а не наш код: `inert` (`App.tsx`: `blocked || undefined`),
`checked`/`value` контролируемых полей, `style` с числовыми `px`-значениями и строками
(`animationDelay`), SVG-атрибуты (`PhotoSvg`, `bull.svg`), `aria-*`/`role`.

## Чего в проекте нет и почему это важно

- **нет `createPortal`** — оверлеи рисуются внутри `.phone`, порталы не нужны;
- **нет `Suspense`/`lazy`** — код-сплиттинг только на входе страницы (`src/intro/shell.ts`), это
  `import()` вне React-дерева;
- **нет `act`** — `@testing-library/react` берёт `React.act`, а при его отсутствии падает на
  `react-dom/test-utils`; алиасы переводят этот путь на `preact/compat/test-utils`, где `act` есть.

## Рецепт свапа (vite 8)

`resolve.alias` в `vite.config.ts` (для сборки и для vitest — конфиг один):

```
react            → preact/compat
react-dom        → preact/compat
```

`react-dom/client` и `react/jsx-runtime` попадают под тот же префиксный ключ
(`preact/compat/client`, `preact/compat/jsx-runtime`), поэтому `jsx: react-jsx` в `tsconfig.json`
и типы `@types/react` не меняются: React остаётся **языковым** именем API, `preact` — реализацией.
В `dependencies` React убран; в `node_modules` он остаётся только как peer `@testing-library/react`
и как «эталон» для негативного контроля ворот размера.

Тестам нужен один настройщик: CJS-сборка `@testing-library/react` зовёт `require('react')` в обход
алиасов. `test.alias` переводит её на ESM-сборку, `server.deps.inline` проводит через резолвер Vite —
тогда RTL и интерфейс видят один рантайм, а `act` приходит из `preact/compat/test-utils`.

## Замер (27.10, три прогона — размеры и хеши совпадают)

| Сборка | main raw | main gzip | шелл gzip | sw gzip | итого gzip |
|---|---|---|---|---|---|
| React 19 + react-dom + scheduler | 1 033,93 кБ | 316,03 кБ | 5,11 | 1,18 | 322,3 кБ |
| preact/compat | 829,73 кБ | 255,14 кБ | 5,11 | 1,18 | 261,4 кБ |

Дельта: **−204,2 кБ raw, −60,9 кБ gzip** (19% JS холодной загрузки), при цели ≥50 кБ.

## Гейты

- `tests/e2e/bundle.spec.ts` — два независимых ворот: сумма gzip-JS из `manifest.json` против бюджета
  (940 кБ raw / 280 кБ gzip) и отсутствие отпечатков React (`Minified React error`,
  `__CLIENT_INTERNALS…`, `react.dev/errors`). Список файлов берётся из манифеста: главный чанк грузится
  динамическим `import()`, в `index.html` его нет — разбор одной разметки мерил только шелл (проверено).
- **Негативный контроль:** `resolve.alias` снят → сборка с React (main 316,15 кБ gzip) → оба ворот
  красные, отпечаток называет `assets/main-*.js`; алиасы возвращены → зелёные.
- **Визуальный паритет:** 8 детерминированных снимков (лента, шапка, composer, ряд вариантов, досье,
  концовка, «телефон сел», тёмная тема) × desktop 1280×900 и Pixel 7 — попиксельно совпадают
  с React-сборкой (Playwright `toHaveScreenshot`, `maxDiffPixels: 0`; одна и та же сцена из
  сохранения, часы страницы заморожены).
- **Партия ботом:** `scripts/playtest-tech.mjs` на трёх профилях — 0 находок на обеих сборках.
- `npx vitest run`, `npm run test:rules`, `npm run test:e2e`, `npm run typecheck`, `npm run lint` — зелёные.

## Что вскрылось на паритете (и починено)

1. **Фокус в диалоге откладывался на кадр.** `useModal` вешал фокус и ловушку клавиш на `useEffect`,
   а preact откладывает пассивные эффекты до `requestAnimationFrame`: открытый диалог успевал
   показаться с фокусом на `body` (ловил `playtest-tech`, «телефон сел»). Фокус при открытии перенесён
   в `useLayoutEffect` (id предыдущего фокуса запоминается там же), ловушка клавиш и возврат фокуса
   остались пассивными: на закрытии подложка уже без `inert`, иначе `focus()` — no-op (это ловили e2e).
2. **Прокрутка вниз не догоняла рост ленты.** Лента (`MessageList`) подписана на эпоху сообщений
   отдельно от `Chat`; в preact её рендер приходил вторым проходом — уже после `useLayoutEffect`,
   который прокручивал чат, и высота к моменту прокрутки была меньше итоговой. Эпоха читается
   в `Chat` и передаётся списку пропом: один проход, прокрутка по итоговой высоте (e2e «длинная
   история» — 4 прогона × 2 проекта зелёные).

## Правки тестов (и почему это не ослабление)

- `fireEvent.change` → `fireEvent.input` для текстового поля заметки: браузер шлёт `input` по букве
  (`change` — только на blur), preact переводит `onChange` textarea ровно в `input`.
- три места ждут завершения асинхронной работы (`flush()` после зарядки и после хода, выбранного
  вариантом): `act` в preact ждёт один кадр, React дренил микрозадачи сам. Утверждения те же.
- комментарий в `intro-shell.spec.ts` про «~323 кБ gzip» обновлён на фактические ~262 кБ.

## Откат

Свап — это зависимость и три строки алиасов: откат = вернуть `react`/`react-dom` в `dependencies`
и убрать `resolve.alias` (+ тестовый алиас ESM-сборки RTL), код интерфейса не меняется. Правки
из раздела «что вскрылось» полезны и без preact (фокус на коммите, одна волна рендера ленты).
