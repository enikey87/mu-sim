# Разработка и проверки

Короткий запуск — в [README](../README.md#запустить-локально). Здесь команды для работы с движком,
контентом и платформами. Требуется Node.js 24+; зависимости ставятся через `npm ci`.

## Основные команды

```sh
npm run dev         # Vite, обычно http://localhost:5173
npm test            # Vitest: движок, контент, сценарии, симуляции, интерфейс
npm run typecheck   # проверка типов
npm run lint        # ESLint
npm run build       # typecheck + Vite, результат в dist/
npm run preview     # показать dist/ локально после сборки
```

Vitest по умолчанию работает в Node; файлы с маркером `@vitest-environment jsdom` — в jsdom.
`typescript` в зависимостях — API 6.x для ESLint, компиляцию выполняет `typescript-7`.

## Браузерные тесты

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright сам собирает проект и запускает `vite preview` на порту 4173. Сценарии идут
в настольном и мобильном Chromium. В CI используется headless shell, установка —
`npx playwright install --with-deps --only-shell chromium`.

## Правила и плейтесты

```sh
npm run test:rules   # изолированный движок правил, порог покрытия 100%
npm run rules:report # отчёт о срабатывании правил в партиях ботом
npm run rules:stable # тот же контракт на других семействах сидов
PLAYTEST_OUT=/tmp/mu-sim-playtest PLAYTEST_SEEDS=1-8 PLAYTEST_TURNS=300 npm run playtest
```

Последняя команда пишет расшифровки партий, записи действий и кадры мира в `PLAYTEST_OUT`.
Для воспроизведения нужны та же версия кода и тот же сид. `rules:stable` запускает дополнительные
выборки и работает заметно дольше обычных тестов. Протокол смыслового аудита —
[`playtest-audit`](../.claude/skills/playtest-audit/SKILL.md).

## Параметры для отладки

| Параметр | Что меняет |
|---|---|
| `?debug` | Показывает факты, память, кандидатов и причину выбора правила. |
| `?fast` | Сокращает паузы; у видимых статусов и пузырей остаётся время на чтение. |
| `?nointro` | Пропускает вступление. |
| `?noidle` | Алик не пишет первым по бездействию игрока. |
| `?hour=3` | Подменяет реальный час. |
| `?away=90` | Имитирует отсутствие игрока 90 минут. |

Параметры можно сочетать: `?debug&fast&nointro`.

## Сборки и публикация

CI — [.github/workflows/pages.yml](../.github/workflows/pages.yml). Тесты, проверка достижимости
правил и E2E идут параллельно. Обязательный чек `build` проверяет их результаты; это не команда
`npm run build`. В PR только с Markdown или `docs/*` тяжёлые проверки пропускаются.
После мержа в `main` GitHub Actions публикует веб-версию и Telegram-сборку в GitHub Pages.

Локальная игра запускается без настройки аналитики. Переменные прод-сборки и настройка приёмников —
в [analytics.md](design/analytics.md). В CI наличие обязательных переменных репозитория проверяет
чек `build`; значения ключей в исходники не добавляют.

Платформенные адаптеры и их сборки — [platforms.md](platforms.md).
Сборка Android через Capacitor — [android.md](android.md).

## Где искать код и решения

| Путь | Содержание |
|---|---|
| [src/engine](../src/engine/) | Игровой цикл, состояние, время, RNG и изолированный движок правил. |
| [src/content](../src/content/) | Реплики, сцены, сюжетные линии, факты и правила игры. |
| [src/ui](../src/ui/) | Интерфейс телефона; фасад игрового состояния — `view.ts`. |
| [src/tools](../src/tools/) | Бот для партий, расшифровки и проверка покрытия правил. |
| [src/platform](../src/platform/) | Адаптеры веба, Telegram, VK и Яндекс Игр. |
| [src/analytics](../src/analytics/) | Приёмники событий аналитики. |

[DESIGN.md](../DESIGN.md) описывает механики игры; [docs/design](design/README.md) — отдельные решения.
Аудиты: [архитектура](ARCHITECTURE_AUDIT.md), [движок правил](RULES_ENGINE_AUDIT.md),
[технические дефекты](TECH_DEFECTS.md).
