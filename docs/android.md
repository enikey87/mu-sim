# Android: APK игры (Capacitor)

Игра — клиентский SPA: одна и та же сборка `vite build` (`base: './'`, `vite.config.ts`) работает и на GitHub Pages, и как веб-часть APK. Нативный проект `android/` добавлен Capacitor 8; игровой код `src/` не менялся.

## Что поставить

| Что | Версия (на ней собрано) |
|---|---|
| JDK | 17+ (сборка проверена на OpenJDK 21) |
| Android SDK | platform `android-36`, build-tools `35.0.0`+ (их запрашивает `android/variables.gradle`) |
| Node | 24+ (`engines` в `package.json`) |

Путь к SDK — переменная `ANDROID_HOME` или строка `sdk.dir=/путь/до/Sdk` в `android/local.properties`. Этот файл в git не попадает: путь машинный.

## От чистого клона до APK

```sh
git clone <репозиторий> && cd mu-sim
npm install
npm run cap:sync   # typecheck + vite build → dist, затем npx cap sync android (кладёт dist в APK)
npm run android    # cd android && ./gradlew assembleDebug
```

Готовый файл: `android/app/build/outputs/apk/debug/app-debug.apk` (≈4.4 МБ, debug-подпись). Ставится на телефон с разрешения на установку из неизвестных источников. Play Market и release-подпись — не этот этап.

## Что внутри

- `android/app/src/main/java/com/enikey/musim/MainActivity.java` — пустой `BridgeActivity`: своего кода нет.
- Иконка и сплэш — дефолтные шаблонные (`android/app/src/main/res/mipmap-*`, `drawable-*`); свои картинки — отдельная задача.
- `cap sync` каждый раз пересобирает `android/app/src/main/assets/public` из `dist` (каталог в `.gitignore`).
- Веб-часть отдаётся WebView по `https://localhost` (`WebViewAssetLoader`), поэтому относительные пути `base: './'` работают как есть.
- Конфиг нативной обвязки — `capacitor.config.ts` в корне (`appId: com.enikey.musim`, `webDir: dist`).

## Известные ограничения

- **Голосовые и «Мууу»** — Web Audio (`src/engine/audio.ts`, `src/engine/moo.ts`): осциллятор, не системный TTS и не `speechSynthesis`. В WebView звук живёт тем же путём, что в браузере, и по-прежнему ждёт первого касания (`unlock`). Отдельного голоса ОС не нужно.
- **Свернуть/развернуть**: партия лежит в localStorage того же WebView — сохранение и восстановление теми же путями, что в вебе (их проверяет e2e).
- Сборка APK требует JDK и Android SDK на машине исполнителя; CI, GitHub Pages и обычная веб-разработка от неё не зависят и настроены как раньше.

## Если сборка падает

- `SDK location not found` — не задан `ANDROID_HOME` и нет `android/local.properties`.
- Приложение открывается пустым — забыт `npm run cap:sync`: в APK лежит прошлый `dist`.
- Долгая первая сборка — Gradle тянет свои зависимости и кешируется в `android/.gradle` (он в `.gitignore`).
