# ко-бот / co-bot

Realtime-модель 6-осевого манипулятора в three.js.

## Структура

```text
html/                 входная html-страница
css/                  все стили интерфейса
js/index.js           точка сборки проекта
js/config.js          все дефолты и настройки
js/ik-loop.js         realtime loop обратной кинематики
js/fk-loop.js         realtime loop прямой кинематики / actual ghost
js/render-loop.js     отрисовка сцены и UI
js/ik/                расчёт обратной кинематики
js/fk/                расчёт прямой кинематики
js/scene/             создание сцены, сетки, осей, света
js/model/             загрузка модели, joints, ghost, материалы
js/components/        callbacks UI-компонентов
```

## Кинематика

Текущий IK — гибридный вариант:

1. при новом target сначала рассчитывается `qGoal`;
2. `joint1-joint3` решают позицию TCP;
3. `joint4-joint6` доворачивают ориентацию и помогают позиции только если arm не дотягивается;
4. realtime loop плавно ведёт `qCommand` к `qGoal` с ограничением скорости и ускорения;
5. `fk-loop` имитирует actual-положение и показывает ghost при рассинхроне.

Сброс — это joint-space home: все углы возвращаются в `rest = 0`.
