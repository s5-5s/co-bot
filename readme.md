# ко-бот / co-bot

Realtime-модель 6-осевого манипулятора в three.js.

## Структура

```text
html/                 входная html-страница
css/                  все стили интерфейса
js/index.js           точка входа
js/source/service.js  один render-цикл приложения
js/source/scene.js    сцена, состояние, target/home flow
js/source/model.js    загрузка модели, ghost, материалы
js/source/joints.js   конфиг joints, лимиты, workspace и motion
js/source/ik.js       расчёт обратной кинематики
js/source/fk.js       расчёт прямой кинематики
js/source/ui.js       DOM-ввод и вывод
```

## Кинематика

Текущий IK — гибридный вариант:

1. при новом target сначала рассчитывается `qGoal`;
2. `joint1-joint3` решают позицию TCP;
3. `joint4-joint6` доворачивают ориентацию и помогают позиции только если arm не дотягивается;
4. один render-цикл плавно ведёт `qCommand` к `qGoal` с ограничением скорости и ускорения;
5. actual/ghost-положение считается через FK и показывает ghost при рассинхроне.

Сброс — это joint-space home: все углы возвращаются в `rest = 0`.
