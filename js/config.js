/** @typedef {'x' | 'y' | 'z'} AxisName */

/**
 * @typedef {Object} JointConfig
 * @property {string} name Имя узла сустава в GLTF-модели
 * @property {AxisName} axis Локальная ось вращения сустава
 * @property {[number, number]} range Ограничения угла в радианах [min, max]
 * @property {number} speed Максимальная угловая скорость (рад/с)
 * @property {number} accel Максимальное угловое ускорение (рад/с²)
 */

const DEG = Math.PI / 180;
const joint = (name, axis, minDeg, maxDeg, speed = 1.6, accel = 5) => ({
    name,
    axis,
    range: /** @type {[number, number]} */ ([minDeg * DEG, maxDeg * DEG]),
    speed,
    accel,
});

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
        tolerance: 0.001,
    },
    workspace: {
        minRadius: 1.2,
        maxRadius: 9,
        minZ: 0.2,
        maxZ: 11.5,
    },
    control: {
        maxFrameDelta: 0.05,
        ghostDiffThreshold: 0.2,
        arrivalTolerance: 0.01,
        jogSpeed: 2.0,
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
        cameraSpeed: 1.5,
        zoomSpeed: 10,
    },
};
