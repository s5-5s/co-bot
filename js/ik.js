import * as THREE from 'three';
import config from './config.js';
import { clamp, wrapAngle } from './math.js';

/** @typedef {import('./robot.js').default} Robot */

/**
 * @typedef {Object} SolveResult
 * @property {Float64Array} angles
 * @property {number} error
 * @property {boolean} reached
 */

const BRANCH_SIGNS = [1, -1];

/**
 * Аналитический position-only IK для геометрии co-bot.
 * J1-J3 определяют положение TCP, углы J4–J6 сохраняются.
 */
export default class IKSolver {
    /** @type {Robot} */
    #robot;

    #origin = new THREE.Vector3();
    #joint2Origin = new THREE.Vector3();
    #joint3Origin = new THREE.Vector3();
    #u = new THREE.Vector3();
    #v = new THREE.Vector3();
    #w = new THREE.Vector3();

    #baseU = 0;
    #baseV = 0;
    #baseW = 0;
    #link1U = 0;
    #link1Length = 0;
    #link1Angle = 0;
    #joint3Sign = 1;

    #neutralAngles;
    #targetOffset = new THREE.Vector3();
    #distalOffset = new THREE.Vector3();
    #tcpBuffer = new THREE.Vector3();
    #quaternionBuffer = new THREE.Quaternion();
    #axisBuffer = new THREE.Vector3();

    /**
     * @param {Robot} robot Виртуальный робот, используемый только для проверки аналитических кандидатов
     */
    constructor(robot) {
        if (robot.joints.length !== 6) {
            throw new Error('Аналитический IK co-bot рассчитан на 6 суставов');
        }

        this.#robot = robot;
        this.#neutralAngles = new Float64Array(robot.joints.length);
        this.#robot.setAngles(this.#neutralAngles);

        robot.joints[0].node.getWorldPosition(this.#origin);
        robot.joints[1].node.getWorldPosition(this.#joint2Origin);
        robot.joints[2].node.getWorldPosition(this.#joint3Origin);

        this.#getWorldAxis(0, this.#w);
        this.#getWorldAxis(1, this.#u);
        this.#v.crossVectors(this.#w, this.#u).normalize();

        const joint3Axis = this.#getWorldAxis(2, this.#axisBuffer);
        this.#joint3Sign = Math.sign(joint3Axis.dot(this.#u));

        if (Math.abs(this.#w.dot(this.#u)) > config.ik.tolerance || Math.abs(joint3Axis.dot(this.#u)) < 1 - config.ik.tolerance) {
            throw new Error('Геометрия J1-J3 не соответствует аналитической модели co-bot');
        }

        const baseOffset = this.#targetOffset.subVectors(this.#joint2Origin, this.#origin);
        this.#baseU = baseOffset.dot(this.#u);
        this.#baseV = baseOffset.dot(this.#v);
        this.#baseW = baseOffset.dot(this.#w);

        const link1 = this.#targetOffset.subVectors(this.#joint3Origin, this.#joint2Origin);
        this.#link1U = link1.dot(this.#u);
        const link1V = link1.dot(this.#v);
        const link1W = link1.dot(this.#w);
        this.#link1Length = Math.hypot(link1V, link1W);
        this.#link1Angle = Math.atan2(link1W, link1V);
    }

    /**
     * Возвращает ближайшую к текущей конфигурации аналитическую ветвь.
     * Если точка недостижима, углы не меняются.
     * @param {THREE.Vector3} targetWorldPos
     * @param {Float64Array} currentAngles
     * @returns {SolveResult}
     */
    solve(targetWorldPos, currentAngles) {
        this.#neutralAngles.set(currentAngles);
        this.#neutralAngles[0] = 0;
        this.#neutralAngles[1] = 0;
        this.#neutralAngles[2] = 0;
        this.#robot.setAngles(this.#neutralAngles);

        this.#distalOffset.subVectors(
            this.#robot.getTcpPosition(this.#tcpBuffer),
            this.#joint3Origin,
        );

        const distalU = this.#distalOffset.dot(this.#u);
        const distalV = this.#distalOffset.dot(this.#v);
        const distalW = this.#distalOffset.dot(this.#w);
        const link2Length = Math.hypot(distalV, distalW);
        const link2Angle = Math.atan2(distalW, distalV);
        const fixedU = this.#baseU + this.#link1U + distalU;

        this.#targetOffset.subVectors(targetWorldPos, this.#origin);
        const targetU = this.#targetOffset.dot(this.#u);
        const targetV = this.#targetOffset.dot(this.#v);
        const targetW = this.#targetOffset.dot(this.#w);
        const horizontalRadiusSq = targetU * targetU + targetV * targetV;
        const branchVSq = horizontalRadiusSq - fixedU * fixedU;
        const toleranceSq = config.ik.tolerance ** 2;

        if (branchVSq < -toleranceSq || link2Length === 0) {
            this.#robot.setAngles(currentAngles);
            return { angles: currentAngles.slice(), error: Infinity, reached: false };
        }

        const branchV = Math.sqrt(Math.max(0, branchVSq));
        const targetHeading = Math.atan2(targetV, targetU);
        let bestQ1 = 0;
        let bestQ2 = 0;
        let bestQ3 = 0;
        let bestDistance = Infinity;

        for (const shoulderSign of BRANCH_SIGNS) {
            const v = shoulderSign * branchV;
            const q1 = wrapAngle(targetHeading - Math.atan2(v, fixedU));
            const planarV = v - this.#baseV;
            const planarW = targetW - this.#baseW;
            const planarRadiusSq = planarV * planarV + planarW * planarW;

            let cosDelta = (
                planarRadiusSq - this.#link1Length ** 2 - link2Length ** 2
            ) / (2 * this.#link1Length * link2Length);

            if (cosDelta < -1 - config.ik.tolerance || cosDelta > 1 + config.ik.tolerance) {
                continue;
            }
            cosDelta = clamp(cosDelta, -1, 1);
            const deltaMagnitude = Math.acos(cosDelta);

            for (const elbowSign of BRANCH_SIGNS) {
                const delta = elbowSign * deltaMagnitude;
                const targetAngle = Math.atan2(planarW, planarV);
                const q2 = wrapAngle(
                    targetAngle -
                    Math.atan2(
                        link2Length * Math.sin(delta),
                        this.#link1Length + link2Length * Math.cos(delta),
                    ) -
                    this.#link1Angle,
                );
                const q3 = wrapAngle(
                    (delta - (link2Angle - this.#link1Angle)) / this.#joint3Sign,
                );

                if (!this.#isInRange(0, q1) || !this.#isInRange(1, q2) || !this.#isInRange(2, q3)) {
                    continue;
                }

                const distance =
                    (q1 - currentAngles[0]) ** 2 +
                    (q2 - currentAngles[1]) ** 2 +
                    (q3 - currentAngles[2]) ** 2;

                if (distance < bestDistance) {
                    bestQ1 = q1;
                    bestQ2 = q2;
                    bestQ3 = q3;
                    bestDistance = distance;
                }
            }
        }

        if (!Number.isFinite(bestDistance)) {
            this.#robot.setAngles(currentAngles);
            return { angles: currentAngles.slice(), error: Infinity, reached: false };
        }

        const bestAngles = currentAngles.slice();
        bestAngles[0] = bestQ1;
        bestAngles[1] = bestQ2;
        bestAngles[2] = bestQ3;
        this.#robot.setAngles(bestAngles);

        const error = targetWorldPos.distanceTo(this.#robot.getTcpPosition(this.#tcpBuffer));
        if (error > config.ik.tolerance) {
            this.#robot.setAngles(currentAngles);
            return { angles: currentAngles.slice(), error, reached: false };
        }

        return { angles: bestAngles, error, reached: true };
    }

    #getWorldAxis(jointIndex, out) {
        const joint = this.#robot.joints[jointIndex];
        joint.node.getWorldQuaternion(this.#quaternionBuffer);
        return out.copy(joint.axis).applyQuaternion(this.#quaternionBuffer).normalize();
    }

    #isInRange(jointIndex, angle) {
        const [min, max] = this.#robot.joints[jointIndex].range;
        return angle >= min && angle <= max;
    }
}
