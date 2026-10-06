# BookNest

BookNest — full-stack веб-читалка для личной библиотеки. Пользователь загружает книгу, сервер извлекает текст и делит его на разделы, а frontend показывает его в адаптивном reader-интерфейсе с сохранением прогресса и настроек.

## Что уже реализовано

- Импорт TXT, Markdown, EPUB, DOCX и PDF (до 20 МБ).
- Автоматическое извлечение метаданных и разбиение текста на главы/разделы.
- Библиотека с поиском, сортировкой, прогрессом и редактированием названия/автора.
- Reader с оглавлением, поиском по книге, закладками и автосохранением позиции.
- 5 тем: бумага, слоновая кость, сепия, ночь и полночь.
- 5 стеков шрифтов, размер текста, межстрочный интервал, ширина страницы, интервалы абзацев, разрядка и выравнивание.
- Focus mode, fullscreen, мобильная нижняя навигация и горячие клавиши.
- Адаптация от телефона до широкого desktop.
- FastAPI + SQLAlchemy backend и React + TypeScript frontend.
- SQLite для локальной разработки и PostgreSQL через `DATABASE_URL` в production.
- Dockerfile и `render.yaml` для Render.

## Структура

```text
booknest/
├─ backend/
│  ├─ requirements.txt
│  └─ app/
│     ├─ database.py
│     ├─ main.py
│     ├─ models.py
│     ├─ parser.py
│     └─ schemas.py
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ lib/
│  │  └─ pages/
│  └─ package.json
├─ Dockerfile
└─ render.yaml
```

## Локальный запуск

### Backend

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\\Scripts\\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

По умолчанию backend создаёт `booknest.db` (SQLite) в корне проекта.

### Frontend

В другом терминале:

```bash
cd frontend
npm install
npm run dev
```

Откройте `http://localhost:5173`. Vite проксирует `/api` на `http://localhost:8000`.

## Запуск через Docker

```bash
docker build -t booknest .
docker run --rm -p 10000:10000 -e PORT=10000 booknest
```

Откройте `http://localhost:10000`.

## Deploy на Render

1. Создайте GitHub/GitLab-репозиторий и отправьте туда содержимое этой папки.
2. В Render выберите **New → Blueprint** и укажите репозиторий с `render.yaml`.
3. Blueprint создаст Docker Web Service и PostgreSQL, затем передаст connection string через `DATABASE_URL`.
4. После deploy откройте выданный `*.onrender.com` URL.

### Важно про бесплатный Render

На Free Web Service локальная файловая система временная, поэтому BookNest не зависит от неё для хранения книг: разобранный текст, прогресс и закладки сохраняются в PostgreSQL. На момент подготовки проекта Free Render Postgres существует как временный вариант и истекает через 30 дней; для постоянной библиотеки нужна постоянная БД/платный PostgreSQL или другой совместимый PostgreSQL.

## API

- `GET /api/books` — библиотека.
- `POST /api/books/upload` — загрузка файла.
- `GET /api/books/{id}` — книга с главами.
- `PATCH /api/books/{id}` — название/автор.
- `DELETE /api/books/{id}` — удалить книгу.
- `PUT /api/books/{id}/progress` — сохранить позицию чтения.
- `GET/POST /api/books/{id}/bookmarks` — закладки.
- `DELETE /api/bookmarks/{id}` — удалить закладку.
- `GET/PUT /api/preferences` — настройки reader.
- `GET /api/health` — health check.

## Что логично добавить дальше

Текущая версия ориентирована на одного владельца библиотеки. Для публичного сервиса следующими слоями стоит добавить авторизацию, раздельные библиотеки пользователей, object storage для оригиналов файлов, миграции Alembic, фоновые задачи для тяжёлых PDF/EPUB и лимиты/антивирусную проверку загрузок.

## Новое в интерфейсе

- Глобальная тема сайта: **Системная / Светлая / Тёмная**. Выбор сохраняется в браузере.
- Три стиля интерфейса: **Soft / Glass / Minimal**.
- Встроенный **диктор** на странице чтения: системные голоса браузера/ОС, выбор голоса, скорость, пауза, продолжение и остановка.
- Импорт книги **по URL** через вкладку «По ссылке». Поддерживаются прямые ссылки на TXT/MD/EPUB/DOCX/PDF и HTML-страницы с текстом. Пример: `https://lib.ru/INPROZ/KAMU/postoronnij.txt`.
- URL-импорт выполняется на backend, поэтому не зависит от CORS сайта-источника. Ограничение размера — 20 МБ; локальные/приватные адреса и нестандартные порты блокируются.

### API импорта по ссылке

```http
POST /api/books/import-url
Content-Type: application/json

{"url":"https://lib.ru/INPROZ/KAMU/postoronnij.txt"}
```


## Что нового в v1.2

- Исправлен импорт старых русских сайтов: учитываются `charset` из HTTP/HTML и автоматически различаются UTF-8, Windows-1251, KOI8-R и CP866.
- Добавлено безопасное восстановление книг, ранее сохранённых с типичным KOI8-R → Windows-1251 mojibake.
- Markdown больше не преобразуется в plain text: сохраняются таблицы, списки, code blocks и математическая разметка.
- Формулы `$...$` и `$$...$$` отображаются через KaTeX.
- Focus mode теперь всегда имеет плавающую кнопку выхода; также работают `F` и `Esc`.
- Добавлен новый стиль интерфейса **Liquid Glass** с blur/saturation, стеклянными панелями и мягкими динамическими фонами.
- На главной странице стиль оформления можно циклически переключать отдельной кнопкой рядом с темой.
