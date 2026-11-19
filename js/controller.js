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
    #targetRobotPos = new THREE.Vector3();
    #targetWorldPos = new THREE.Vector3();
    #homeAngles;
    #targetAngles;
    #jogRobotDelta = new THREE.Vector3();
    #jogWorldDelta = new THREE.Vector3();
    #toolQuaternion = new THREE.Quaternion();

    /**
     * @param {Robot} robot
     */
    constructor(robot) {
        this.robot = robot;
        this.ghost = robot.createGhost();
        this.#solver = new IKSolver(this.ghost);
        this.#homeAngles = new Float64Array(robot.joints.length);
        this.#targetAngles = new Float64Array(robot.angles);
        this.robot.getTcpPosition(this.#targetWorldPos);
        RobotFrame.toRobot(this.#targetWorldPos, this.#targetRobotPos);
    }

    /**
     * Возвращает текущую позицию TCP в системе координат робота.
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getCurrentTcpRobotPosition(out = new THREE.Vector3()) {
        this.robot.getTcpPosition(out);
        return RobotFrame.toRobot(out, out);
    }

    /**
     * Вычисляет IK один раз для новой цели и сохраняет найденные углы.
     * @returns {THREE.Vector3} Фактически принятая цель
     */
    /**
     * Смещает цель TCP на заданный вектор.
     * В BASE вектор задан в системе основания робота, в TOOL — в текущей системе инструмента.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {'base' | 'tool'} frame
     * @returns {THREE.Vector3}
     */
    jog(x, y, z, frame) {
        this.getCurrentTcpRobotPosition(this.#targetRobotPos);
        this.#jogRobotDelta.set(x, y, z);

        if (frame === 'tool') {
            RobotFrame.toWorld(this.#jogRobotDelta, this.#jogWorldDelta);
            this.robot.toolNode.getWorldQuaternion(this.#toolQuaternion);
            this.#jogWorldDelta.applyQuaternion(this.#toolQuaternion);
            RobotFrame.toRobot(this.#jogWorldDelta, this.#jogRobotDelta);
        }

        return this.moveToRobotPosition(
            this.#targetRobotPos.x + this.#jogRobotDelta.x,
            this.#targetRobotPos.y + this.#jogRobotDelta.y,
            this.#targetRobotPos.z + this.#jogRobotDelta.z,
        );
    }

    moveToRobotPosition(x, y, z) {
        const oldX = this.#targetRobotPos.x;
        const oldY = this.#targetRobotPos.y;
        const oldZ = this.#targetRobotPos.z;

        this.#targetRobotPos.set(x, y, z);
        this.#clampToWorkspace(this.#targetRobotPos);
        RobotFrame.toWorld(this.#targetRobotPos, this.#targetWorldPos);

        const referenceAngles = this.#mode === 'tracking' ? this.#targetAngles : this.robot.angles;
        const solution = this.#solver.solve(this.#targetWorldPos, referenceAngles);
        if (!solution.reached) {
            this.#targetRobotPos.set(oldX, oldY, oldZ);
            RobotFrame.toWorld(this.#targetRobotPos, this.#targetWorldPos);
            this.ghost.setAngles(this.#targetAngles);
            return this.#targetRobotPos.clone();
        }

        this.#targetAngles.set(solution.angles);
        this.ghost.setAngles(this.#targetAngles);
        this.ghost.object.visible = true;
        this.#mode = 'tracking';
        return this.#targetRobotPos.clone();
    }

    goHome() {
        this.#targetAngles.set(this.#homeAngles);
        this.ghost.setAngles(this.#homeAngles);
        this.ghost.getTcpPosition(this.#targetWorldPos);
        RobotFrame.toRobot(this.#targetWorldPos, this.#targetRobotPos);
        this.#mode = 'homing';
        this.ghost.object.visible = false;
    }

    update(dt) {
        if (this.#mode === 'homing') {
            this.#stepHoming(dt);
        } else if (this.#mode === 'tracking') {
            this.#stepTracking(dt);
        }
    }

    #stepHoming(dt) {
        this.robot.stepTowards(this.#homeAngles, dt);
        if (this.robot.maxAngleDifference(this.#homeAngles) < config.control.arrivalTolerance) {
            this.robot.setAngles(this.#homeAngles);
            this.robot.stop();
            this.#mode = 'idle';
        }
    }

    #stepTracking(dt) {
        this.robot.stepTowards(this.#targetAngles, dt);
        const angleGap = this.robot.maxAngleDifference(this.#targetAngles);
        this.ghost.object.visible = angleGap > config.control.ghostDiffThreshold;

        if (angleGap < config.control.arrivalTolerance) {
            this.robot.setAngles(this.#targetAngles);
            this.robot.stop();
            this.ghost.object.visible = false;
            this.#mode = 'idle';
        }
    }

    #clampToWorkspace(robotPos) {
        const { minRadius, maxRadius, minZ, maxZ } = config.workspace;
        robotPos.z = clamp(robotPos.z, minZ, maxZ);

        const radialDist = Math.hypot(robotPos.x, robotPos.y);
        if (radialDist < config.ik.tolerance) {
            robotPos.x = minRadius;
            robotPos.y = 0;
            return;
        }

        const radius = clamp(radialDist, minRadius, maxRadius);
        const scale = radius / radialDist;
        robotPos.x *= scale;
        robotPos.y *= scale;
    }
}
