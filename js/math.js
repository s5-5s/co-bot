import * as THREE from 'three';

/** @typedef {import('./config.js').AxisName} AxisName */

/** @type {Readonly<Record<AxisName, THREE.Vector3>>} */
const AXIS_VECTORS = Object.freeze({
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
});

/**
 * Ограничивает число заданным диапазоном [min, max].
 */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Возвращает единичный вектор локальной оси.
 * Вектор нельзя изменять.
 * @param {AxisName} axis
 * @returns {THREE.Vector3}
 */
export const getAxisVector = (axis) => AXIS_VECTORS[axis];

/**
 * Приводит угол к диапазону [-π, π).
 * @param {number} angle
 * @returns {number}
 */
export const wrapAngle = (angle) => {
    const twoPi = Math.PI * 2;
    return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
};

/**
 * Преобразование между правой системой координат робота (Z вверх)
 * и системой координат Three.js (Y вверх).
 */
export const RobotFrame = {
    /**
     * Из координат робота (x, y, z) в мировые координаты Three.js (x, z, -y).
     */
    toWorld(robotPos, target = new THREE.Vector3()) {
        return target.set(robotPos.x, robotPos.z, -robotPos.y);
    },

    /**
     * Из мировых координат Three.js (x, y, z) в координаты робота (x, -z, y).
     */
    toRobot(worldPos, target = new THREE.Vector3()) {
        return target.set(worldPos.x, -worldPos.z, worldPos.y);
    },
};
