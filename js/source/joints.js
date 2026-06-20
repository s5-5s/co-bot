import * as THREE from "three";

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default class Joints {
    #names = ["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"];
    #endEffector = "joint6";

    #config = {
        joint1: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.55, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
        joint2: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
        joint3: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
        joint4: { axis: new THREE.Vector3(0, 0, 1), group: "wrist", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.25, orientationWeight: 0.75, velocityScale: 1.2, accelerationScale: 1.15 },
        joint5: { axis: new THREE.Vector3(0, 0, 1), group: "wrist", min: -140 * TO_RAD, max: 140 * TO_RAD, rest: 0, positionWeight: 0.3, orientationWeight: 0.9, velocityScale: 1.2, accelerationScale: 1.15 },
        joint6: { axis: new THREE.Vector3(1, 0, 0), group: "wrist", min: -180 * TO_RAD, max: 180 * TO_RAD, rest: 0, positionWeight: 0.02, orientationWeight: 0.45, velocityScale: 0.8, accelerationScale: 0.85 }
    };

    #motion = {
        kp: 3.8,
        maxVelocity: 2.35,
        maxAcceleration: 6.5,
        velocityFilter: 0.32,
        actualVelocityScale: 4.5
    };

    #workspace = {
        base: new THREE.Vector3(0, 0, 0),
        minRadius: 1,
        maxRadius: 30,
        minY: -8,
        maxY: 30
    };

    #ik = {
        useOrientation: true,
        goalIterations: 100,
        goalOrientationIterations: 35,
        wristAssistError: 0.8
    };

    get names() { return [...this.#names]; }
    get endEffector() { return this.#endEffector; }
    get motion() { return this.#motion; }
    get workspace() { return this.#workspace; }
    get ik() { return this.#ik; }
    get toDeg() { return TO_DEG; }

    config = (name) => this.#config[name];

    createModelJoints = (object) => {
        const joints = {};
        const initialQuaternions = {};
        const axes = {};

        for (const name of this.#names) {
            const joint = object.getObjectByName(name);
            joints[name] = joint;

            if (!joint) {
                console.warn(`${name} не найден`);
                continue;
            }

            initialQuaternions[name] = joint.quaternion.clone();
            axes[name] = this.#config[name].axis.clone();
        }

        return { joints, initialQuaternions, axes };
    };

    restAngles = () => this.cloneAngles();

    cloneAngles = (source) => Object.fromEntries(this.#names.map((name) => [name, source?.[name] ?? this.#config[name].rest ?? 0]));

    cloneVelocity = (source) => Object.fromEntries(this.#names.map((name) => [name, source?.[name] ?? 0]));

    setAngles = ({ joints, initialQuaternions, axes, angles }) => {
        for (const name of this.#names) {
            if (!joints[name] || !initialQuaternions[name] || !axes[name]) continue;

            const angle = angles?.[name] ?? this.#config[name].rest ?? 0;
            const rotation = new THREE.Quaternion().setFromAxisAngle(axes[name].clone().normalize(), angle);
            joints[name].quaternion.copy(initialQuaternions[name]).multiply(rotation);
        }
    };

    maxAngleError = (current, target) => this.#names.reduce((max, name) => Math.max(max, Math.abs((target[name] ?? 0) - (current[name] ?? 0))), 0);

    moveAnglesToGoal = ({ current, goal, velocity, dt, speedScale = 1, config = this.#motion }) => {
        const angles = this.cloneAngles(current);
        const nextVelocity = this.cloneVelocity(velocity);

        for (const name of this.#names) {
            const joint = this.#config[name];
            const maxVelocity = config.maxVelocity * (joint.velocityScale ?? 1) * speedScale;
            const maxAcceleration = config.maxAcceleration * (joint.accelerationScale ?? 1) * speedScale;
            const oldVelocity = nextVelocity[name] ?? 0;
            const error = this.angleWrap((goal[name] ?? 0) - (current[name] ?? 0));
            const wantedVelocity = clamp(error * config.kp * speedScale, -maxVelocity, maxVelocity);
            const smoothVelocity = oldVelocity + (wantedVelocity - oldVelocity) * config.velocityFilter;

            nextVelocity[name] = clamp(smoothVelocity, oldVelocity - maxAcceleration * dt, oldVelocity + maxAcceleration * dt);
            nextVelocity[name] = clamp(nextVelocity[name], -maxVelocity, maxVelocity);
            angles[name] = clamp((current[name] ?? 0) + nextVelocity[name] * dt, joint.min, joint.max);
        }

        return { angles, velocity: nextVelocity };
    };

    limitTargetWorkspace = (target) => {
        const { base, minRadius, maxRadius, minY, maxY } = this.#workspace;
        const offset = target.clone().sub(base);
        const distance = offset.length();

        if (distance > 1e-9) target.copy(base).add(offset.multiplyScalar(Math.min(maxRadius, Math.max(minRadius, distance)) / distance));

        target.y = clamp(target.y, minY, maxY);
        return target;
    };

    angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

    clamp = clamp;

    vectorLimit = (vector, limit) => {
        const length = vector.length();
        if (length < 1e-9 || length <= limit) return vector;
        return vector.multiplyScalar(limit / length);
    };

    rotationErrorVector = ({ current, target }) => {
        const q = target.clone().multiply(current.clone().invert()).normalize();
        if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);

        const vector = new THREE.Vector3(q.x, q.y, q.z);
        const length = vector.length();

        if (length < 1e-9) return vector.multiplyScalar(2);

        return vector.multiplyScalar(2 * Math.atan2(length, q.w) / length);
    };
}
