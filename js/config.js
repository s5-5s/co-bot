/** @typedef {'x' | 'y' | 'z'} AxisName */

/**
 * @typedef {Object} JointConfig
 * @property {string} name Имя узла сустава в GLTF-модели
 * @property {AxisName} axis Ось вращения сустава
 * @property {[number, number]} range Ограничения угла в радианах [min, max]
 * @property {number} speed Максимальная угловая скорость (рад/с)
 * @property {number} accel Максимальное угловое ускорение (рад/с²)
 */

/**
 * @typedef {Object} AppConfig
 * @property {Object} model
 * @property {string} model.path
 * @property {number} model.scale
 * @property {[number, number, number]} model.tcp Локальное смещение инструмента (TCP)
 * @property {number} model.ghostOpacity Прозрачность модели-предпросмотра
 * @property {JointConfig[]} joints
 * @property {Object} ik
 * @property {number} ik.damping Коэффициент демпфирования (Levenberg-Marquardt)
 * @property {number} ik.tolerance Допустимая ошибка позиции (м)
 * @property {number} ik.rotTolerance Допустимая ошибка ориентации (рад)
 * @property {number} ik.rotWeight Вес ошибки ориентации при стартовом поиске
 * @property {number} ik.jumpThreshold Порог скачка углов для глобального поиска (рад)
 * @property {number} ik.maxIterations Максимум итераций уточнения
 * @property {number} ik.seedIterations Максимум итераций при переборе стартовых поз
 * @property {number} ik.seedAngleStep Шаг сетки для генерации стартовых поз (рад)
 * @property {number} ik.seedRefinements Количество лучших кандидатов для доводки
 * @property {number} ik.cacheEpsilon Порог изменения цели для сброса кэша IK (м)
 * @property {Object} workspace
 * @property {number} workspace.minRadius Минимальный вылет от оси основания (м)
 * @property {number} workspace.maxRadius Максимальный вылет от оси основания (м)
 * @property {number} workspace.minZ Минимальная высота по Z (м)
 * @property {number} workspace.maxZ Максимальная высота по Z (м)
 * @property {Object} control
 * @property {number} control.fixedTimeStep Шаг физического обновления (с)
 * @property {number} control.maxFrameDelta Максимальный dt за один кадр (с)
 * @property {number} control.ghostDiffThreshold Порог расхождения углов для показа «призрака» (рад)
 * @property {number} control.homeTolerance Допуск прибытия в домашнюю позицию (рад)
 * @property {Object} scene
 * @property {number} scene.background
 * @property {[number, number, number]} scene.cameraPosition
 * @property {[number, number, number]} scene.cameraTarget
 * @property {number} scene.fov
 * @property {number} scene.gridSize
 * @property {number} scene.gridStep
 * @property {number} scene.gridColor
 * @property {number} scene.axisLength
 * @property {Object.<AxisName, string>} scene.axisColors
 */

const DEG = Math.PI / 180;
const joint = (name, axis, minDeg, maxDeg, speed = 1.6, accel = 5) => ({
    name,
    axis,
    range: /** @type {[number, number]} */ ([minDeg * DEG, maxDeg * DEG]),
    speed,
    accel,
});

/** @type {AppConfig} */
export default {
    model: {
        path: './models/co-bot.gltf',
        scale: 10,
        tcp: [0, 0.25, 0],
        ghostOpacity: 0.25,
    },
    joints: [
        joint('joint1', 'x', -170, 170),
        joint('joint2', 'x', -120, 120),
        joint('joint3', 'x', -145, 145),
        joint('joint4', 'z', -170, 170, 2.2, 7),
        joint('joint5', 'z', -120, 120, 2.2, 7),
        joint('joint6', 'x', -360, 360, 3, 10),
    ],
    ik: {
        damping: 0.05,
        tolerance: 0.001,
        rotTolerance: 0.015,
        rotWeight: 0.2,
        jumpThreshold: 0.5,
        maxIterations: 65,
        seedIterations: 30,
        seedAngleStep: 1.5,
        seedRefinements: 4,
        cacheEpsilon: 1e-6,
    },
    workspace: {
        minRadius: 1.2,
        maxRadius: 9,
        minZ: 0.2,
        maxZ: 11.5,
    },
    control: {
        fixedTimeStep: 1 / 200,
        maxFrameDelta: 0.5,
        ghostDiffThreshold: 0.2,
        homeTolerance: 0.01,
    },
    scene: {
        background: 0x000000,
        cameraPosition: [20, 37, 20],
        cameraTarget: [0, 4, 0],
        fov: 65,
        gridSize: 100,
        gridStep: 5,
        gridColor: 0x431b22,
        axisLength: 20,
        axisColors: { x: '#9cc8e5', y: '#e6a2a7', z: '#afe7c0' },
    },
    gamepad: {
        deadzone: 0.15,
        targetSpeed: 2.0,
        cameraSpeed: 1.5,
        zoomSpeed: 10,
        targetInterval: 1 / 30,
    },
};
