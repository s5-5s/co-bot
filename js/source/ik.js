import * as THREE from "three";

export default class IK {
    #joints = undefined;
    #goalKey = "";
    #goalAngles = null;

    constructor(joints) {
        this.#joints = joints;
    }

    calculate = ({ model, qActual, qCommand, qDotCommand, target, targetQuaternion, mode, dt }) => {
        const current = this.#joints.cloneAngles(qCommand ?? qActual);
        const velocity = this.#joints.cloneVelocity(qDotCommand);

        if (!Number.isFinite(dt) || dt <= 0) {
            return { angles: current, velocity, error: 0, rotationError: 0, homeError: 0 };
        }

        const goal = this.#goalByMode({ model, current: qActual ?? qCommand, target, targetQuaternion, mode });
        const result = this.#joints.moveAnglesToGoal({ current, goal, velocity, dt });

        model.setAngles(result.angles);

        const pose = this.#pose(model);
        const error = pose ? target.distanceTo(pose.position) : Infinity;
        const homeError = this.#joints.maxAngleError(result.angles, goal);

        return { angles: result.angles, velocity: result.velocity, error, rotationError: 0, homeError };
    };

    #goalByMode = (options) => {
        if (options.mode === "home") {
            this.#goalKey = "home";
            this.#goalAngles = this.#joints.restAngles();
            return this.#goalAngles;
        }

        const key = `${options.mode}:${options.target.x.toFixed(3)}:${options.target.y.toFixed(3)}:${options.target.z.toFixed(3)}`;

        if (key !== this.#goalKey || !this.#goalAngles) {
            this.#goalAngles = this.#createGoal(options);
            this.#goalKey = key;
        }

        return this.#goalAngles;
    };

    #createGoal = (options) => {
        const current = this.#joints.cloneAngles(options.current);
        let best = null;

        for (const seed of this.#seeds({ current, target: options.target })) {
            const angles = this.#joints.cloneAngles(seed);

            this.#solveStage({ ...options, angles });
            options.model.setAngles(angles);

            const pose = this.#pose(options.model);
            const candidate = { angles, cost: this.#cost({ angles, current, pose, target: options.target }) };

            if (!best || candidate.cost < best.cost) best = candidate;
        }

        return best?.angles ?? current;
    };

    #solveStage = ({ model, angles, target, targetQuaternion }) => {
        for (let i = 0; i < this.#joints.ik.goalIterations; i++) {
            model.setAngles(angles);

            const pose = this.#pose(model);
            if (!pose) return;

            const error = target.clone().sub(pose.position);
            const velocity = this.#dlsSolve({
                columns: this.#jacobian(model).filter((column) => column.config.group === "arm").map((column) => ({ ...column, vector: column.linear })),
                error: this.#joints.vectorLimit(error.multiplyScalar(5), 12),
                damping: 0.35,
                weightName: "positionWeight"
            });

            if (error.length() > this.#joints.ik.wristAssistError) {
                for (const column of this.#jacobian(model).filter((column) => column.config.group === "wrist")) {
                    velocity[column.name] = (velocity[column.name] ?? 0) + column.linear.dot(error) * 0.015;
                }
            }

            this.#applyVelocity({ angles, velocity, dt: 0.035 });
        }

        if (!targetQuaternion) return;

        for (let i = 0; i < this.#joints.ik.goalOrientationIterations; i++) {
            model.setAngles(angles);

            const pose = this.#pose(model);
            if (!pose) return;

            const error = this.#joints.rotationErrorVector({ current: pose.quaternion, target: targetQuaternion });
            const velocity = this.#dlsSolve({
                columns: this.#jacobian(model).filter((column) => column.config.group === "wrist").map((column) => ({ ...column, vector: column.angular })),
                error: this.#joints.vectorLimit(error.multiplyScalar(0.8), 0.8),
                damping: 0.6,
                weightName: "orientationWeight"
            });

            this.#applyVelocity({ angles, velocity, dt: 0.03 });
        }
    };

    #jacobian = (model) => {
        const pose = this.#pose(model);
        if (!pose) return [];

        return this.#joints.names.flatMap((name) => {
            const joint = model.joints[name];
            const axis = model.axes[name];
            if (!joint || !axis) return [];

            const jointPosition = new THREE.Vector3();
            const axisWorld = this.#axisWorld({ joint, axis });

            joint.getWorldPosition(jointPosition);

            return [{
                name,
                config: this.#joints.config(name),
                linear: axisWorld.clone().cross(pose.position.clone().sub(jointPosition)),
                angular: axisWorld
            }];
        });
    };

    #axisWorld = ({ joint, axis }) => {
        const quaternion = new THREE.Quaternion();
        joint.getWorldQuaternion(quaternion);
        return axis.clone().normalize().applyQuaternion(quaternion).normalize();
    };

    #pose = (model) => {
        const endEffector = model.joints[this.#joints.endEffector] ?? model.object.getObjectByName(this.#joints.endEffector);
        if (!endEffector) return null;

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        model.object.updateMatrixWorld(true);
        endEffector.getWorldPosition(position);
        endEffector.getWorldQuaternion(quaternion);

        return { position, quaternion };
    };

    #applyVelocity = ({ angles, velocity, dt }) => {
        for (const name of this.#joints.names) {
            const joint = this.#joints.config(name);
            const maxVelocity = this.#joints.motion.maxVelocity * (joint.velocityScale ?? 1);
            const value = this.#joints.clamp(velocity[name] ?? 0, -maxVelocity, maxVelocity);

            angles[name] = this.#joints.clamp((angles[name] ?? 0) + value * dt, joint.min, joint.max);
        }
    };

    #dlsSolve = ({ columns, error, damping, weightName }) => {
        const matrix = [[damping * damping, 0, 0], [0, damping * damping, 0], [0, 0, damping * damping]];
        const velocity = {};

        for (const column of columns) {
            const weight = column.config[weightName] ?? 1;
            const vector = column.vector;

            matrix[0][0] += weight * vector.x * vector.x; matrix[0][1] += weight * vector.x * vector.y; matrix[0][2] += weight * vector.x * vector.z;
            matrix[1][0] += weight * vector.y * vector.x; matrix[1][1] += weight * vector.y * vector.y; matrix[1][2] += weight * vector.y * vector.z;
            matrix[2][0] += weight * vector.z * vector.x; matrix[2][1] += weight * vector.z * vector.y; matrix[2][2] += weight * vector.z * vector.z;
        }

        const solved = this.#solve3(matrix, [error.x, error.y, error.z]);

        for (const column of columns) {
            const weight = column.config[weightName] ?? 1;
            const vector = column.vector;

            velocity[column.name] = weight * (vector.x * solved[0] + vector.y * solved[1] + vector.z * solved[2]);
        }

        return velocity;
    };

    #solve3 = (matrix, vector) => {
        const a = matrix.map((row, i) => [...row, vector[i]]);

        for (let i = 0; i < 3; i++) {
            let pivot = i;

            for (let j = i + 1; j < 3; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;

            [a[i], a[pivot]] = [a[pivot], a[i]];

            if (Math.abs(a[i][i]) < 1e-9) return [0, 0, 0];

            for (let j = i + 1; j < 4; j++) a[i][j] /= a[i][i];

            a[i][i] = 1;

            for (let j = 0; j < 3; j++) {
                if (j === i) continue;

                const k = a[j][i];

                for (let n = i; n < 4; n++) a[j][n] -= k * a[i][n];
            }
        }

        return [a[0][3], a[1][3], a[2][3]];
    };

    #cost = ({ angles, current, pose, target }) => {
        if (!pose) return Infinity;

        let value = target.distanceTo(pose.position) * 500;

        for (const name of this.#joints.names) {
            const joint = this.#joints.config(name);
            const range = Math.max(joint.max - joint.min, 1e-6);
            const center = (joint.min + joint.max) * 0.5;
            const limit = Math.abs((angles[name] - center) / (range * 0.5));

            value += Math.abs(this.#joints.angleWrap(angles[name] - (current[name] ?? 0))) * 0.8;
            value += Math.abs(this.#joints.angleWrap(angles[name] - (joint.rest ?? 0))) * 0.25;
            value += Math.max(0, limit - 0.75) ** 2 * 30;
        }

        value += Math.max(0, Math.abs(angles.joint1 ?? 0) - 125 * Math.PI / 180) ** 2 * 60;
        value += Math.max(0, -70 * Math.PI / 180 - (angles.joint2 ?? 0)) ** 2 * 90;

        return value;
    };

    #seeds = ({ current, target }) => {
        const rest = this.#joints.restAngles();
        const base = -Math.atan2(target.z, target.x);

        return [
            this.#joints.cloneAngles(current),
            { ...rest, joint1: base, joint2: 0, joint3: -90 * Math.PI / 180, joint4: -40 * Math.PI / 180, joint5: 65 * Math.PI / 180 },
            { ...rest, joint1: base, joint2: 20 * Math.PI / 180, joint3: -120 * Math.PI / 180, joint4: -40 * Math.PI / 180, joint5: 85 * Math.PI / 180 },
            { ...rest, joint1: base, joint2: -20 * Math.PI / 180, joint3: -70 * Math.PI / 180, joint4: -25 * Math.PI / 180, joint5: 45 * Math.PI / 180 },
            rest
        ];
    };
}
