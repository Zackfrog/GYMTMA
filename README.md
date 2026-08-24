# 🏋️ Gym Mini App — Telegram WebApp Workout Tracker

[Русский](#русский) | [English](#english)

---

## Русский

### 📝 Описание проекта
**Gym Mini App** — это современное и быстрое веб-приложение (Telegram Mini App), разработанное специально для удобного отслеживания силовых тренировок и замеров параметров тела прямо внутри Telegram. Интерфейс оптимизирован для мобильных устройств, поддерживает жесты, анимированные переходы и хранит данные в облачной базе данных Supabase с надежным резервным копированием в локальный кэш.

### ✨ Основные возможности
* **🔥 Интерактивный таймер тренировки**: Секундомер реального времени на главном экране наглядно показывает текущую длительность активной сессии.
* **✍️ Быстрый лог упражнений**: Удобное добавление весов и повторений с возможностью моментально отменить/удалить любой подход.
* **📈 Трекер прогрессии с графиками**: Прямо во время добавления подходов вы видите историю своих результатов и красивый наглядный график прогресса весов за прошлые сессии.
* **📏 Управление замерами**: Фиксация веса, объемов тела и автоматический расчет разницы (дельта) по сравнению с предыдущими измерениями.
* **🗂️ База упражнений**: Возможность создавать свои уникальные категории (мышечные группы) с эмодзи-иконками и добавлять новые упражнения.
* **🔐 Безопасность и приватность**: Личные тренировки, веса и замеры каждого пользователя строго изолированы по их Telegram `user_id`. Список категорий и упражнений является общим каталогом.

### 🛠️ Технологический стек
* **Frontend**: React (v19), TypeScript, Vite (v6), Tailwind CSS (v4), Motion (Framer Motion) для плавной анимации, Recharts для визуализации прогресса.
* **Backend**: Node.js, Express, `esbuild` (сборка бэкенда в единый `.cjs` файл).
* **База данных**: Supabase (PostgreSQL) в качестве основного облака + локальный отказоустойчивый файл `db.json` для резервного копирования.

---

## English

### 📝 Description
**Gym Mini App** is a fast, responsive Telegram Mini App designed for seamlessly logging your strength workouts and tracking body measurements. With a mobile-first UI featuring smooth fluid transitions, it keeps your metrics handy and syncs your progress safely to a cloud Supabase instance with local fallback persistence.

### ✨ Core Features
* **🔥 Live Workout Timer**: A real-time stopwatch on the main dashboard tracking active workout duration.
* **✍️ Seamless Set Logging**: Log weights and repetitions on-the-fly, with instant correction and delete buttons.
* **📈 Progression Assistant with Charts**: View historic weight benchmarks and an interactive progression line chart directly inside the set-logger panel.
* **📏 Measurement Tracker**: Log body weight, chest, waist, and other sizes. Computes dynamic change deltas automatically.
* **🗂️ Library Management**: Edit categories, delete custom entries, or add new muscle groups with custom emoji icons.
* **🔐 Strict Privacy**: Workouts, history logs, and measurements are securely isolated using Telegram `user_id`. Muscle categories and names are shared across users as a joint catalog.

### 🛠️ Technical Stack
* **Frontend**: React (v19), TypeScript, Vite (v6), Tailwind CSS (v4), Motion for animations, Recharts for progress charts.
* **Backend**: Node.js, Express, `esbuild` for compiling into a single self-contained `.cjs` server file.
* **Database**: Supabase (PostgreSQL) as the primary cloud database, with local `db.json` file fallback.
