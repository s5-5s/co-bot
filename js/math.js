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
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Возвращает единичный вектор для указанной оси.
 * @param {AxisName} axis
 * @returns {THREE.Vector3}
 */
export const getAxisVector = (axis) => AXIS_VECTORS[axis];

/**
 * Преобразование между правой системой координат робота (Z вверх)
 * и системой координат Three.js (Y вверх).
 */
export const RobotFrame = {
    /**
     * Из координат робота (x, y, z) в мировые координаты Three.js (x, z, -y).
     * @param {THREE.Vector3} robotPos
     * @param {THREE.Vector3} [target]
     * @returns {THREE.Vector3}
     */
    toWorld(robotPos, target = new THREE.Vector3()) {
        return target.set(robotPos.x, robotPos.z, -robotPos.y);
    },

    /**
     * Из мировых координат Three.js (x, y, z) в координаты робота (x, -z, y).
     * @param {THREE.Vector3} worldPos
     * @param {THREE.Vector3} [target]
     * @returns {THREE.Vector3}
     */
    toRobot(worldPos, target = new THREE.Vector3()) {
        return target.set(worldPos.x, -worldPos.z, worldPos.y);
    },
};

/**
 * Вычисляет вектор угловой ошибки (ось * угол) для перехода от current к desired.
 * @param {THREE.Quaternion} current
 * @param {THREE.Quaternion} desired
 * @param {THREE.Vector3} outError
 * @returns {THREE.Vector3}
 */
export function computeOrientationError(current, desired, outError) {
    // q_err = desired * current^-1
    const qx = desired.x * current.w - desired.w * current.x - desired.y * current.z + desired.z * current.y;
    const qy = desired.y * current.w - desired.w * current.y - desired.z * current.x + desired.x * current.z;
    const qz = desired.z * current.w - desired.w * current.z - desired.x * current.y + desired.y * current.x;
    let qw = desired.w * current.w + desired.x * current.x + desired.y * current.y + desired.z * current.z;

    // Кратчайший путь поворота (qw >= 0)
    const sign = qw < 0 ? -1 : 1;
    qw *= sign;

    const sinHalfAngle = Math.hypot(qx, qy, qz);
    if (sinHalfAngle < 1e-8) {
        return outError.set(0, 0, 0);
    }

    const angle = 2 * Math.atan2(sinHalfAngle, qw);
    const scale = (sign * angle) / sinHalfAngle;
    return outError.set(qx * scale, qy * scale, qz * scale);
}

/**
 * Решает систему линейных уравнений A * x = b методом Гаусса с частичным выбором ведущего элемента.
 * Внимание: изменяет переданные массивы matrix и rhs на месте.
 *
 * @param {Float64Array} matrix Квадратная матрица размера n * n (по строкам)
 * @param {Float64Array} rhs Вектор правой части длины n
 * @param {number} n Размерность системы
 * @returns {Float64Array | null} Вектор решения длины n или null, если матрица вырождена
 */
export function solveLinearSystem(matrix, rhs, n) {
    for (let pivotCol = 0; pivotCol < n; pivotCol++) {
        // Поиск максимального по модулю элемента в столбце
        let maxRow = pivotCol;
        for (let row = pivotCol + 1; row < n; row++) {
            if (Math.abs(matrix[row * n + pivotCol]) > Math.abs(matrix[maxRow * n + pivotCol])) {
                maxRow = row;
            }
        }

        if (Math.abs(matrix[maxRow * n + pivotCol]) < 1e-10) {
            return null;
        }

        // Перестановка строк
        if (maxRow !== pivotCol) {
            for (let col = pivotCol; col < n; col++) {
                const idxA = pivotCol * n + col;
                const idxB = maxRow * n + col;
                const tmp = matrix[idxA];
                matrix[idxA] = matrix[idxB];
                matrix[idxB] = tmp;
            }
            const tmpRhs = rhs[pivotCol];
            rhs[pivotCol] = rhs[maxRow];
            rhs[maxRow] = tmpRhs;
        }

        // Прямой ход (исключение)
        const pivotValue = matrix[pivotCol * n + pivotCol];
        for (let row = pivotCol + 1; row < n; row++) {
            const factor = matrix[row * n + pivotCol] / pivotValue;
            for (let col = pivotCol + 1; col < n; col++) {
                matrix[row * n + col] -= factor * matrix[pivotCol * n + col];
            }
            rhs[row] -= factor * rhs[pivotCol];
        }
    }

    // Обратный ход
    const solution = new Float64Array(n);
    for (let row = n - 1; row >= 0; row--) {
        let sum = rhs[row];
        for (let col = row + 1; col < n; col++) {
            sum -= matrix[row * n + col] * solution[col];
        }
        solution[row] = sum / matrix[row * n + row];
    }
    return solution;
}
