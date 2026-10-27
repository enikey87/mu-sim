# Preact вместо React: инвентаризация и замер

> **Статус:** в работе · задача #1447 · пакет бут-загрузки #1443 → #1444 → #1446 → #1447

Цель задачи — снять с холодной загрузки React (`react` + `react-dom` + `scheduler`, ~32% бандла)
и оставить на его месте `preact/compat` при полном паритете поведения и вида.
Документ фиксирует инвентаризацию API (её задача требует **до** свапа), рецепт и протокол замера;
цифры до/после — в PR задачи.

## Инвентаризация: что интерфейс берёт из React

`grep` по `src/` (14 файлов, 16 импортов) — весь рантайм-контакт с React.

| API | Где | Что значит для compat |
|---|---|---|
| `createRoot`, `StrictMode` | `src/main.tsx` | корень один, `render` без `hydrate`; `StrictMode` в compat = `Fragment` (двойного вызова инициализаторов нет — игра создаётся вне дерева, это остаётся верным) |
| `useState`, `useRef`, `useEffect`, `useLayoutEffect`, `useCallback`, `useMemo` | `App.tsx`, `Chat.tsx`, `Header.tsx`, `Input.tsx`, `Intro.tsx`, `Message.tsx`, `Overlays.tsx`, `Sheet.tsx`, `Review.tsx`, `DebugPanel.tsx`, `useModal.ts` | все хуки есть в `preact/hooks`, включая `useLayoutEffect` (в браузере — синхронный) |
| `useSyncExternalStore` | `Chat.tsx` (эпоха ленты), `DebugPanel.tsx` (версия), `useGame.ts` (подписка) | реализация compat поверх `options.__c`; сверка — по тестам и e2e, не по документации |
| `createContext`, `useContext` | `useGame.ts` (`GameContext`), `Review.tsx` (заметки рецензента) | `createContext`/`useContext` compat; провайдер один, значение меняется редко |
| `memo` | `Message.tsx`, `Chat.tsx` (`MessageList`) | `memo` уважает `areEqual` по умолчанию; в проекте сравнивателя нет — совпадает |
| `Component`, `getDerivedStateFromError`, `componentDidCatch` | `App.tsx` (`class Crash`) | единственный классовый компонент — error boundary; `componentDidCatch` в compat есть |
| типы `ReactNode`, `ReactElement`, `RefObject`, `MouseEvent`, `PointerEvent`, `FormEvent` | `App.tsx`, `Chat.tsx`, `Sheet.tsx`, `Input.tsx`, `Message.tsx` | берутся из `@types/react` и остаются ими: тип-контракт не меняется |
| объектные `ref` | `App.tsx` (`.phone`), `Chat.tsx` (`.chat`), `Overlays.tsx` ×2, `Sheet.tsx`, `Review.tsx`, `Intro.tsx` | compat присваивает `.current`; функция-ref не используется |
| `createPortal`, `Suspense`, `lazy`, `forwardRef`, `flushSync`, `useId`, `useTransition`, `useDeferredValue`, `dangerouslySetInnerHTML`, `findDOMNode`, `Children` | — | **не используются**; упрощает compat: портал и код-сплиттинг-примитивы вне периметра |

События (все — обычные нативные обработчики, без синтетической экзотики):
`onClick` (35), `onChange` (3 — текст и чекбокс `DebugPanel`), `onSubmit`, `onScroll`,
`onKeyDown`, `onContextMenu`, `onPointerDown/Move/Up/Cancel` (долгое нажатие в `Input`/`Message`).
Compat переводит `onChange` у `input`/`textarea` в `input`-событие так же, как React; `onScroll` и
указательные события вешаются нативно — расхождения проверяются e2e и `ui.test.tsx`.

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
react-dom/client → preact/compat/client
```

`react/jsx-runtime` попадает под тот же префикс (`preact/compat/jsx-runtime`), поэтому `jsx: react-jsx`
в `tsconfig.json` и типы `@types/react` не меняются: React остаётся **языковым** именем API,
`preact` — реализацией.

## Замер и гейты

- **Бандл.** `npm run build` три раза (сборка детерминирована: одинаковый хеш и размер), сырой и gzip
  размер JS-ассетов из отчёта vite. Цель — минус ≥50 кБ gzip.
- **Гейт размера** — `tests/e2e/bundle.spec.ts`: сумма gzip-JS прод-сборки против бюджета и
  отсутствие в ней отпечатков React. Мутация «алиас не применился» (React вернулся в бандл) обязана
  красить этот спек.
- **Паритет.** `npx vitest run` (RTL на compat), `npm run test:rules`, `npm run test:e2e`
  (скриншоты до/после в PR), партия бота через `scripts/playtest-tech.mjs` со сверкой статистик
  с бейзлайном, ручной смоук на мобильном вьюпорте.

## Откат

Свап — это три строки алиасов и зависимость: откат = вернуть `react`/`react-dom` в `dependencies`
и убрать `resolve.alias` (один коммит, без правок кода интерфейса — код не знает, кто под именами React).
Если инвентаризация или паритет вскроет несовместимость, ветка закрывается протокол-отказом с цифрами,
а не форсируется.
