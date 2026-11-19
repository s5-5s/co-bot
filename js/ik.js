import * as THREE from 'three';
import config from './config.js';
import { clamp, computeOrientationError, solveLinearSystem } from './math.js';

/** @typedef {import('./robot.js').default} Robot */
/** @typedef {import('./robot.js').JacobianColumn} JacobianColumn */
/** @typedef {import('./robot.js').Pose} Pose */

/**
 * @typedef {Object} SolveResult
 * @property {Float64Array} angles Найденные углы суставов
 * @property {number} error Итоговая ошибка по позиции (м)
 * @property {boolean} reached Достигнута ли заданная точность
 */

export default class IKSolver {
    /** @type {Robot} */
    #robot;
    /** @type {number} */
    #dof;
    /** @type {Float64Array[]} */
    #seedConfigs;

    // Кэш последнего решения
    /** @type {THREE.Vector3 | null} */
    #cachedTarget = null;
    /** @type {SolveResult | null} */
    #cachedResult = null;

    // Предвыделенные буферы для минимизации нагрузки на сборщик мусора
    /** @type {JacobianColumn[]} */
    #jacobian;
    /** @type {Pose} */
    #poseBuffer = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    #posError = new THREE.Vector3();
    #rotError = new THREE.Vector3();
    /** @type {Float64Array} */
    #normalMatrix;
    /** @type {Float64Array} */
    #normalRhs;
    /** @type {Float64Array} */
    #candidateAngles;

    /**
     * @param {Robot} robot Виртуальный экземпляр робота для кинематических расчётов
     */
    constructor(robot) {
        this.#robot = robot;
        this.#dof = robot.joints.length;
        this.#seedConfigs = this.#generateSeedGrid();

        this.#jacobian = Array.from({ length: this.#dof }, () => ({
            linear: new THREE.Vector3(),
            angular: new THREE.Vector3(),
        }));
        this.#normalMatrix = new Float64Array(this.#dof * this.#dof);
        this.#normalRhs = new Float64Array(this.#dof);
        this.#candidateAngles = new Float64Array(this.#dof);
    }

    /**
     * Решает задачу обратной кинематики для заданной целевой точки в мировых координатах.
     *
     * @param {THREE.Vector3} targetWorldPos Целевая позиция TCP в мировых координатах
     * @param {Float64Array} currentAngles Текущие углы суставов робота
     * @param {THREE.Quaternion | null} [targetOrientation=null] Целевая ориентация (если null — только позиция)
     * @returns {SolveResult}
     */
    solve(targetWorldPos, currentAngles, targetOrientation = null) {
        if (!targetOrientation && this.#isTargetCached(targetWorldPos)) {
            return this.#cachedResult;
        }

        // 1. Локальный поиск от текущей конфигурации суставов
        let best = this.#refineFromSeed(
            currentAngles,
            targetWorldPos,
            targetOrientation,
            config.ik.maxIterations,
            targetOrientation ? 1 : 0,
        );

        const maxJump = this.#maxAngleJump(best.angles, currentAngles);
        const needsGlobalSearch = !best.reached || maxJump > config.ik.jumpThreshold;

        // 2. Глобальный поиск по сетке стартовых поз при недостижимости или резком скачке
        if (needsGlobalSearch) {
            best = this.#searchAcrossSeeds(best, currentAngles, targetWorldPos, targetOrientation);
        }

        this.#cachedTarget = targetWorldPos.clone();
        this.#cachedResult = best;
        return best;
    }

    /**
     * Сбрасывает кэш последнего решения.
     */
    invalidateCache() {
        this.#cachedTarget = null;
        this.#cachedResult = null;
    }

    /**
     * Проверяет, совпадает ли новая цель с закэшированной в пределах допуска.
     * @param {THREE.Vector3} target
     * @returns {boolean}
     */
    #isTargetCached(target) {
        return Boolean(
            this.#cachedTarget &&
            this.#cachedResult &&
            target.distanceToSquared(this.#cachedTarget) < config.ik.cacheEpsilon ** 2,
        );
    }

    /**
     * Генерирует декартово произведение дискретных значений углов для первых 3 суставов.
     * @returns {Float64Array[]}
     */
    #generateSeedGrid() {
        const step = config.ik.seedAngleStep;
        const axisSamples = this.#robot.joints.slice(0, 3).map(({ range: [min, max] }) => {
            const values = [];
            for (let angle = min + step / 2; angle < max; angle += step) {
                values.push(angle);
            }
            return values.length ? values : [(min + max) / 2];
        });

        /** @type {Float64Array[]} */
        const seeds = [];
        const current = new Float64Array(this.#dof);

        const buildCombinations = (jointIdx) => {
            if (jointIdx === axisSamples.length) {
                seeds.push(current.slice());
                return;
            }
            for (const angle of axisSamples[jointIdx]) {
                current[jointIdx] = angle;
                buildCombinations(jointIdx + 1);
            }
        };

        buildCombinations(0);
        return seeds;
    }

    /**
     * Перебирает сетку стартовых конфигураций и доводит лучшие кандидаты до точного решения.
     *
     * @param {SolveResult} initialBest
     * @param {Float64Array} currentAngles
     * @param {THREE.Vector3} targetPos
     * @param {THREE.Quaternion | null} targetRot
     * @returns {SolveResult}
     */
    #searchAcrossSeeds(initialBest, currentAngles, targetPos, targetRot) {
        const rotWeight = targetRot ? config.ik.rotWeight : 0;

        const candidates = this.#seedConfigs
            .map((seed) => {
                const res = this.#refineFromSeed(seed, targetPos, targetRot, config.ik.seedIterations, rotWeight);
                const travelPenalty = this.#angleDistance(res.angles, currentAngles) * 0.01;
                return { res, score: res.error + travelPenalty };
            })
            .sort((a, b) => a.score - b.score)
            .slice(0, config.ik.seedRefinements);

        let best = initialBest;
        for (const { res: candidate } of candidates) {
            const refined = this.#refineFromSeed(
                candidate.angles,
                targetPos,
                targetRot,
                config.ik.maxIterations,
                targetRot ? 1 : 0,
            );
            if (this.#isBetterSolution(refined, best, currentAngles)) {
                best = refined;
            }
        }
        return best;
    }

    /**
     * Сравнивает два решения IK по точности и близости к текущей позе робота.
     * @param {SolveResult} candidate
     * @param {SolveResult} currentBest
     * @param {Float64Array} referenceAngles
     * @returns {boolean}
     */
    #isBetterSolution(candidate, currentBest, referenceAngles) {
        if (candidate.reached !== currentBest.reached) {
            return candidate.reached;
        }
        if (candidate.reached) {
            return this.#angleDistance(candidate.angles, referenceAngles) <
                this.#angleDistance(currentBest.angles, referenceAngles);
        }
        return candidate.error < currentBest.error;
    }

    /**
     * Итеративно уточняет углы суставов методом демпфированных наименьших квадратов (DLS)
     * с поиском шага с откатом (backtracking line search).
     *
     * @param {Float64Array} startAngles
     * @param {THREE.Vector3} targetPos
     * @param {THREE.Quaternion | null} targetRot
     * @param {number} maxIterations
     * @param {number} rotWeight
     * @returns {SolveResult}
     */
    #refineFromSeed(startAngles, targetPos, targetRot, maxIterations, rotWeight) {
        this.#robot.setAngles(startAngles);
        const { tolerance, rotTolerance } = config.ik;

        let posErrorNorm = Infinity;
        let rotErrorNorm = 0;

        for (let iter = 0; iter < maxIterations; iter++) {
            const pose = this.#robot.getTcpPose(this.#poseBuffer);
            this.#posError.subVectors(targetPos, pose.position);
            posErrorNorm = this.#posError.length();

            if (targetRot) {
                computeOrientationError(pose.quaternion, targetRot, this.#rotError);
                rotErrorNorm = this.#rotError.length();
            } else {
                this.#rotError.set(0, 0, 0);
                rotErrorNorm = 0;
            }

            if (posErrorNorm < tolerance && (!targetRot || rotErrorNorm < rotTolerance)) {
                return { angles: this.#robot.angles.slice(), error: posErrorNorm, reached: true };
            }

            this.#robot.computeJacobian(pose.position, this.#jacobian);
            const deltaAngles = this.#solveDampedStep(rotWeight);
            if (!deltaAngles) break;

            // Поиск длины шага с уменьшением (1.0 -> 0.5 -> 0.25 -> ...)
            const currentCost = posErrorNorm + rotWeight * rotErrorNorm;
            const accepted = this.#applyLineSearchStep(deltaAngles, targetPos, targetRot, rotWeight, currentCost);
            if (!accepted) break;
        }

        const pose = this.#robot.getTcpPose(this.#poseBuffer);
        posErrorNorm = targetPos.distanceTo(pose.position);
        if (targetRot) {
            computeOrientationError(pose.quaternion, targetRot, this.#rotError);
            rotErrorNorm = this.#rotError.length();
        }
        const reached = posErrorNorm < tolerance && (!targetRot || rotErrorNorm < rotTolerance);
        return { angles: this.#robot.angles.slice(), error: posErrorNorm, reached };
    }

    /**
     * Формирует и решает систему нормальных уравнений (J^T * W * J + λ^2 * I) * Δθ = J^T * W * e.
     * @param {number} rotWeight
     * @returns {Float64Array | null}
     */
    #solveDampedStep(rotWeight) {
        const n = this.#dof;
        const dampingSq = config.ik.damping ** 2;
        const matrix = this.#normalMatrix;
        const rhs = this.#normalRhs;

        for (let row = 0; row < n; row++) {
            const colI = this.#jacobian[row];
            rhs[row] = colI.linear.dot(this.#posError) + rotWeight * colI.angular.dot(this.#rotError);

            for (let col = 0; col < n; col++) {
                const colJ = this.#jacobian[col];
                matrix[row * n + col] =
                    colI.linear.dot(colJ.linear) +
                    rotWeight * colI.angular.dot(colJ.angular);
            }
            matrix[row * n + row] += dampingSq;
        }

        return solveLinearSystem(matrix, rhs, n);
    }
    /**
    * Подбирает коэффициент шага alpha так, чтобы суммарная ошибка строго уменьшилась.
    * @returns {boolean} true, если удалось сделать шаг с уменьшением ошибки
    */
    #applyLineSearchStep(deltaAngles, targetPos, targetRot, rotWeight, previousCost) {
        const baseAngles = this.#robot.angles.slice();
        const trialRotError = new THREE.Vector3();
        for (let alpha = 1; alpha > 0.01; alpha *= 0.5) {
            for (let i = 0; i < this.#dof; i++) {
                const [min, max] = this.#robot.joints[i].range;
                this.#candidateAngles[i] = clamp(baseAngles[i] + alpha * deltaAngles[i], min, max);
            }
            this.#robot.setAngles(this.#candidateAngles);
            const trialPose = this.#robot.getTcpPose(this.#poseBuffer);
            const trialPosErr = targetPos.distanceTo(trialPose.position);
            const trialRotErr = targetRot ? computeOrientationError(trialPose.quaternion, targetRot, trialRotError).length() : 0;
            if (trialPosErr + rotWeight * trialRotErr < previousCost) {
                return true;
            }
        }
        // Откат, если ни один шаг не улучшил решение
        this.#robot.setAngles(baseAngles);
        return false;
    }
    /**
    * Сумма квадратов разностей углов между двумя конфигурациями.
    */
    #angleDistance(a, b) {
        let sumSq = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sumSq += diff * diff;
        }
        return sumSq;
    }
    /**
    * Максимальное изменение угла по любому из суставов.
    */
    #maxAngleJump(a, b) {
        let maxJump = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = Math.abs(a[i] - b[i]);
            if (diff > maxJump) maxJump = diff;
        }
        return maxJump;
    }
}