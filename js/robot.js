import * as THREE from 'three';
import config from './config.js';
import { clamp, getAxisVector } from './math.js';

/**
 * @typedef {Object} BoundJoint
 * @property {THREE.Object3D} node Узел сустава в иерархии модели
 * @property {THREE.Vector3} axis Локальная ось вращения
 * @property {THREE.Quaternion} baseRotation Исходный поворот узла из GLTF
 * @property {[number, number]} range Ограничения угла [min, max]
 * @property {number} speed Максимальная скорость (рад/с)
 * @property {number} accel Максимальное ускорение (рад/с²)
 */

/**
 * @typedef {Object} JacobianColumn
 * @property {THREE.Vector3} linear Линейная составляющая (v = ω × r)
 * @property {THREE.Vector3} angular Угловая составляющая (ω)
 */

/**
 * @typedef {Object} Pose
 * @property {THREE.Vector3} position Мировая позиция инструмента (TCP)
 * @property {THREE.Quaternion} quaternion Мировая ориентация инструмента (TCP)
 */

export default class Robot {
    /** @type {THREE.Object3D} */
    object;
    /** @type {Float64Array} */
    angles;
    /** @type {Float64Array} */
    velocity;
    /** @type {THREE.Vector3} */
    tcpOffset;
    /** @type {BoundJoint[]} */
    joints;
    /** @type {THREE.Object3D} */
    toolNode;

    // Буферы для вычислений без аллокаций в горячих циклах
    #tmpAxisQuat = new THREE.Quaternion();
    #tmpWorldQuat = new THREE.Quaternion();
    #tmpJointOrigin = new THREE.Vector3();
    #tmpOffset = new THREE.Vector3();

    /**
     * @param {THREE.Object3D} object Корневой объект 3D-модели манипулятора
     */
    constructor(object) {
        this.object = object;
        this.object.scale.setScalar(config.model.scale);

        const dof = config.joints.length;
        this.angles = new Float64Array(dof);
        this.velocity = new Float64Array(dof);
        this.tcpOffset = new THREE.Vector3(...config.model.tcp);

        this.joints = this.#bindJoints(object);
        this.#validateKinematicChain();

        this.toolNode = this.joints.at(-1).node;
        this.setAngles(this.angles);
    }

    /**
     * Привязывает конфигурацию суставов к узлам 3D-сцены.
     * @param {THREE.Object3D} root
     * @returns {BoundJoint[]}
     */
    #bindJoints(root) {
        return config.joints.map((jointCfg) => {
            const node = root.getObjectByName(jointCfg.name);
            if (!node) {
                throw new Error(`Сустав "${jointCfg.name}" не найден в 3D-модели`);
            }
            return {
                node,
                axis: getAxisVector(jointCfg.axis),
                baseRotation: node.quaternion.clone(),
                range: jointCfg.range,
                speed: jointCfg.speed,
                accel: jointCfg.accel,
            };
        });
    }

    /**
     * Проверяет, что узлы суставов образуют корректную иерархическую цепочку.
     */
    #validateKinematicChain() {
        for (let i = 1; i < this.joints.length; i++) {
            const prevNode = this.joints[i - 1].node;
            let parent = this.joints[i].node.parent;
            let isDescendant = false;

            while (parent) {
                if (parent === prevNode) {
                    isDescendant = true;
                    break;
                }
                parent = parent.parent;
            }

            if (!isDescendant) {
                throw new Error(`Сустав "${this.joints[i].node.name}" не является потомком "${prevNode.name}"`);
            }
        }
    }

    /**
     * Устанавливает углы суставов с учётом механических ограничений и обновляет матрицы сцены.
     * @param {ArrayLike<number>} targetAngles
     */
    setAngles(targetAngles) {
        for (let i = 0; i < this.joints.length; i++) {
            const joint = this.joints[i];
            const clampedAngle = clamp(targetAngles[i], joint.range[0], joint.range[1]);
            this.angles[i] = clampedAngle;

            this.#tmpAxisQuat.setFromAxisAngle(joint.axis, clampedAngle);
            joint.node.quaternion.copy(joint.baseRotation).multiply(this.#tmpAxisQuat);
        }
        this.object.updateMatrixWorld(true);
    }

    /**
     * Вычисляет текущее положение и ориентацию TCP в мировых координатах (прямая кинематика).
     * @param {Pose} [outPose] Опциональный объект для записи результата без создания новых векторов
     * @returns {Pose}
     */
    getTcpPose(outPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }) {
        outPose.position.copy(this.tcpOffset);
        this.toolNode.localToWorld(outPose.position);
        this.toolNode.getWorldQuaternion(outPose.quaternion);
        return outPose;
    }

    /**
     * Вычисляет геометрический якобиан для текущей конфигурации суставов.
     * @param {THREE.Vector3} tcpWorldPosition Текущая мировая позиция TCP
     * @param {JacobianColumn[]} outColumns Предвыделенный массив столбцов длины joints.length
     */
    computeJacobian(tcpWorldPosition, outColumns) {
        for (let i = 0; i < this.joints.length; i++) {
            const { node, axis } = this.joints[i];
            node.getWorldQuaternion(this.#tmpWorldQuat);
            node.getWorldPosition(this.#tmpJointOrigin);

            const column = outColumns[i];
            column.angular.copy(axis).applyQuaternion(this.#tmpWorldQuat).normalize();
            this.#tmpOffset.subVectors(tcpWorldPosition, this.#tmpJointOrigin);
            column.linear.crossVectors(column.angular, this.#tmpOffset);
        }
    }

    /**
     * Продвигает суставы к целевым углам за шаг dt с учётом ограничений скорости и ускорения.
     * @param {ArrayLike<number>} targetAngles
     * @param {number} dt Шаг времени (с)
     */
    stepTowards(targetAngles, dt) {
        const nextAngles = this.angles;

        for (let i = 0; i < this.joints.length; i++) {
            const { range, speed: maxSpeed, accel: maxAccel } = this.joints[i];
            const goal = clamp(targetAngles[i], range[0], range[1]);
            const error = goal - this.angles[i];
            const currentVel = this.velocity[i];

            if (Math.abs(error) < 1e-6 && Math.abs(currentVel) < 1e-6) {
                this.velocity[i] = 0;
                nextAngles[i] = goal;
                continue;
            }

            // Максимальная скорость с учётом тормозного пути v = sqrt(2 * a * |error|)
            const brakingSpeed = Math.sqrt(2 * maxAccel * Math.abs(error));
            const desiredVel = Math.sign(error) * Math.min(maxSpeed, brakingSpeed);
            const maxDeltaVel = maxAccel * dt;

            const nextVel = currentVel + clamp(desiredVel - currentVel, -maxDeltaVel, maxDeltaVel);
            const nextAngle = this.angles[i] + nextVel * dt;
            if ((error > 0 && nextAngle > goal) || (error < 0 && nextAngle < goal)) {
                this.velocity[i] = 0;
                nextAngles[i] = goal;
            } else {
                this.velocity[i] = nextVel;
                nextAngles[i] = nextAngle;
            }
        }

        this.setAngles(nextAngles);
    }

    /**
     * Сбрасывает скорости всех суставов в ноль.
     */
    stop() {
        this.velocity.fill(0);
    }

    /**
     * Возвращает максимальную разницу углов (в радианах) между текущим роботом и другим массивом углов.
     * @param {ArrayLike<number>} otherAngles
     * @returns {number}
     */
    maxAngleDifference(otherAngles) {
        let maxDiff = 0;
        for (let i = 0; i < this.angles.length; i++) {
            const diff = Math.abs(this.angles[i] - otherAngles[i]);
            if (diff > maxDiff) maxDiff = diff;
        }
        return maxDiff;
    }

    /**
     * Создаёт полупрозрачную копию модели для визуализации целевой позы («призрак»).
     * @returns {Robot}
     */
    createGhost() {
        const clone = this.object.clone(true);
        clone.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = config.model.ghostOpacity;
                child.material.depthWrite = false;
            }
        });

        const ghost = new Robot(clone);
        ghost.object.visible = false;
        return ghost;
    }
}
