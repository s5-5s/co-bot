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

    #tmpAxisQuat = new THREE.Quaternion();

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

    #validateKinematicChain() {
        for (let i = 1; i < this.joints.length; i++) {
            const prevNode = this.joints[i - 1].node;
            let parent = this.joints[i].node.parent;

            while (parent && parent !== prevNode) {
                parent = parent.parent;
            }

            if (!parent) {
                throw new Error(`Сустав "${this.joints[i].node.name}" не является потомком "${prevNode.name}"`);
            }
        }
    }

    /**
     * Устанавливает углы суставов с учётом механических ограничений.
     * @param {ArrayLike<number>} targetAngles
     */
    setAngles(targetAngles) {
        for (let i = 0; i < this.joints.length; i++) {
            const joint = this.joints[i];
            const angle = clamp(targetAngles[i], joint.range[0], joint.range[1]);
            this.angles[i] = angle;

            this.#tmpAxisQuat.setFromAxisAngle(joint.axis, angle);
            joint.node.quaternion.copy(joint.baseRotation).multiply(this.#tmpAxisQuat);
        }
        this.object.updateMatrixWorld(true);
    }

    /**
     * Возвращает мировую позицию TCP.
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getTcpPosition(out = new THREE.Vector3()) {
        out.copy(this.tcpOffset);
        return this.toolNode.localToWorld(out);
    }

    /**
     * Продвигает суставы к целевым углам с ограничениями скорости и ускорения.
     * @param {ArrayLike<number>} targetAngles
     * @param {number} dt
     */
    stepTowards(targetAngles, dt) {
        for (let i = 0; i < this.joints.length; i++) {
            const { range, speed: maxSpeed, accel: maxAccel } = this.joints[i];
            const goal = clamp(targetAngles[i], range[0], range[1]);
            const error = goal - this.angles[i];
            const currentVel = this.velocity[i];

            if (Math.abs(error) < 1e-6 && Math.abs(currentVel) < 1e-6) {
                this.velocity[i] = 0;
                this.angles[i] = goal;
                continue;
            }

            const brakingSpeed = Math.sqrt(2 * maxAccel * Math.abs(error));
            const desiredVel = Math.sign(error) * Math.min(maxSpeed, brakingSpeed);
            const maxDeltaVel = maxAccel * dt;
            const nextVel = currentVel + clamp(desiredVel - currentVel, -maxDeltaVel, maxDeltaVel);
            const nextAngle = this.angles[i] + nextVel * dt;

            if ((error > 0 && nextAngle > goal) || (error < 0 && nextAngle < goal)) {
                this.velocity[i] = 0;
                this.angles[i] = goal;
            } else {
                this.velocity[i] = nextVel;
                this.angles[i] = nextAngle;
            }
        }

        this.setAngles(this.angles);
    }

    stop() {
        this.velocity.fill(0);
    }

    /**
     * Максимальная разница с другой конфигурацией суставов.
     * @param {ArrayLike<number>} otherAngles
     * @returns {number}
     */
    maxAngleDifference(otherAngles) {
        let maxDiff = 0;
        for (let i = 0; i < this.angles.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(this.angles[i] - otherAngles[i]));
        }
        return maxDiff;
    }

    /**
     * Создаёт полупрозрачную копию робота для отображения целевой конфигурации.
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
