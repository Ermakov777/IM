# PRIP/NAVIP — сайт + бот

## Что внутри
- `/site` — GitHub Pages сайт. Читает `../data/prips.json` и рисует точки на карте (Leaflet).
- `/data/prips.json` — база точек (массив объектов).
- `/bot` — Telegram-бот. Команда: `/add Название | lat | lng | описание` добавляет точку и коммитит в репозиторий.

## Настройка GitHub Pages
1. В репозитории GitHub открой **Settings → Pages**.
2. Build and deployment → **Deploy from a branch**.
3. Branch: `main`, Folder: `/site`.
4. Сохранить. После деплоя сайт раздаст `/site/index.html`.

## Настройка бота
1. Создай бота у **@BotFather** → получи `BOT_TOKEN`.
2. Узнай свой Telegram ID (например, через **@userinfobot**) → `OWNER_ID`.
3. Создай **GitHub fine‑grained token** с правами **Repository contents: Read and Write** → `GH_TOKEN`.
4. Укажи переменные окружения (см. `bot/.env.example`): 
   - `BOT_TOKEN`
   - `OWNER_ID`
   - `GH_TOKEN`
   - `GH_OWNER` (например, `ermakov777`)
   - `GH_REPO` (например, `prip-navip-map`)
   - `GH_BRANCH` (по умолчанию `main`)
   - `GH_PATH` (по умолчанию `data/prips.json`)
5. Запусти бота локально (`npm i` → `node index.js`) **или** задеплой на Render/Heroku/VPS (есть `Dockerfile` и `Procfile`).

## Формат данных ПРИПа
```json
{
  "id": "uuid",
  "title": "Название",
  "desc": "Описание",
  "lat": 55.75,
  "lng": 37.62,
  "createdAt": "2025-09-16T12:00:00Z"
}
```

## Как пользоваться
- В чате с ботом отправь:
```
/add ПРИП у парка | 55.752 | 37.623 | вход со стороны реки
```
- Бот добавит запись в `data/prips.json` (коммит в репозиторий).
- GitHub Pages начнёт раздавать обновлённый `prips.json` — сайт покажет новую точку при обновлении страницы (или автоматически через 60 секунд).

## Безопасность
- Добавление точек разрешено **только** пользователю с `OWNER_ID`.
- Сайт не имеет форм ввода и служит только для отображения.

---
Готово. Скопируй содержимое архива в корень репозитория и включи Pages для папки `/site`.
