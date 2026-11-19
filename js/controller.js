import * as THREE from 'three';
import config from './config.js';
import { clamp, RobotFrame } from './math.js';
import IKSolver from './ik.js';

/** @typedef {import('./robot.js').default} Robot */
/** @typedef {'idle' | 'tracking' | 'homing'} ControlMode */

export default class RobotController {
    /** @type {Robot} */
    robot;
    /** @type {Robot} */
    ghost;
    /** @type {IKSolver} */
    #solver;

    /** @type {ControlMode} */
    #mode = 'idle';
    /** @type {THREE.Vector3} Целевая точка в системе координат робота (Z вверх) */
    #targetRobotPos = new THREE.Vector3();
    /** @type {THREE.Vector3} Целевая точка в мировых координатах Three.js */
    #targetWorldPos = new THREE.Vector3();
    /** @type {Float64Array} */
    #homeAngles;
    /** @type {Float64Array} */
    #targetAngles;

    /**
     * @param {Robot} robot Основной робот на сцене
     */
    constructor(robot) {
        this.robot = robot;
        this.ghost = robot.createGhost();
        this.#homeAngles = new Float64Array(robot.joints.length);
        this.#targetAngles = robot.angles.slice();

        // Отдельный виртуальный экземпляр для расчётов IK без влияния на рендер
        const ikWorkerRobot = new robot.constructor(robot.object.clone(true));
        this.#solver = new IKSolver(ikWorkerRobot);
    }

    /**
     * Возвращает текущую позицию TCP в системе координат робота (Z вверх).
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getCurrentTcpRobotPosition(out = new THREE.Vector3()) {
        const pose = this.robot.getTcpPose();
        return RobotFrame.toRobot(pose.position, out);
    }

    /**
     * Задаёт новую целевую координату TCP в системе координат робота и запускает движение.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {THREE.Vector3} Фактическая (ограниченная рабочей зоной) цель в координатах робота
     */
    moveToRobotPosition(x, y, z) {
        this.#targetRobotPos.set(x, y, z);
        this.#clampToWorkspace(this.#targetRobotPos);
        RobotFrame.toWorld(this.#targetRobotPos, this.#targetWorldPos);

        const solution = this.#solver.solve(
            this.#targetWorldPos,
            this.#mode === 'tracking' ? this.#targetAngles : this.robot.angles
        );
        this.#targetAngles = solution.angles;
        this.ghost.setAngles(this.#targetAngles);
        this.#mode = 'tracking';
        return this.#targetRobotPos.clone();
    }

    /**
     * Запускает возврат всех суставов в нулевое (домашнее) положение.
     */
    goHome() {
        this.#mode = 'homing';
        this.#solver.invalidateCache();
        this.ghost.object.visible = false;
    }

    /**
     * Выполняет один физический шаг управления длительностью dt.
     * @param {number} dt Шаг времени (с)
     */
    update(dt) {
        if (this.#mode === 'homing') {
            this.#stepHoming(dt);
            return;
        }

        if (this.#mode === 'tracking') {
            this.#stepTracking(dt);
        }
    }

    /**
     * Шаг возврата в домашнюю позицию.
     * @param {number} dt
     */
    #stepHoming(dt) {
        this.robot.stepTowards(this.#homeAngles, dt);

        if (this.robot.maxAngleDifference(this.#homeAngles) < config.control.homeTolerance) {
            this.robot.setAngles(this.#homeAngles);
            this.robot.stop();
            this.#mode = 'idle';
        }
    }

    /**
     * Шаг отслеживания целевой точки через IK.
     * @param {number} dt
     */
    #stepTracking(dt) {
        this.robot.stepTowards(this.#targetAngles, dt);
        this.ghost.object.visible =
            this.robot.maxAngleDifference(this.#targetAngles) > config.control.ghostDiffThreshold;
    }

    /**
     * Ограничивает точку допустимой рабочей областью манипулятора.
     * @param {THREE.Vector3} robotPos
     */
    #clampToWorkspace(robotPos) {
        const { minRadius, maxRadius, minZ, maxZ } = config.workspace;
        robotPos.z = clamp(robotPos.z, minZ, maxZ);

        const radialDist = Math.hypot(robotPos.x, robotPos.y);
        if (radialDist < 1e-6) {
            robotPos.x = minRadius;
            return;
        }

        const clampedRadius = clamp(radialDist, minRadius, maxRadius);
        const scale = clampedRadius / radialDist;
        robotPos.x *= scale;
        robotPos.y *= scale;
    }
}