import {
  distance3,
  limit3,
  rotateByQuaternion,
  rotationErrorVector,
  solveSymmetric3
} from "./math.js";

const LEGACY_TO_MILLIMETERS = 1000 / 15;
const POSITION_ERROR_GAIN = 5;
const POSITION_ERROR_LIMIT = 12 * LEGACY_TO_MILLIMETERS;
const POSITION_DAMPING = 0.35 * LEGACY_TO_MILLIMETERS;
const WRIST_ASSIST_GAIN = 0.015 / (LEGACY_TO_MILLIMETERS * LEGACY_TO_MILLIMETERS);
const REACHABLE_ERROR = 5;

export default class IK {
  constructor(joints, view) {
    this.joints = joints;
    this.view = view;
    this.goalAngles = joints.createState();
    this.bestAngles = joints.createState();
    this.velocity = joints.createState();
    this.matrix = new Float64Array(9);
    this.error = new Float64Array(3);
    this.solution = new Float64Array(3);
    this.axis = new Float64Array(3);
    this.vector = new Float64Array(3);
    this.rotationError = new Float64Array(3);
    this.seedStates = Array.from({ length: 5 }, () => joints.createState());
    this.lastKey = "";
    this.lastError = Infinity;
  }

  reset() {
    this.lastKey = "";
    this.lastError = Infinity;
  }

  solve(target, targetQuaternion, current) {
    const key = `${target[0].toFixed(3)}:${target[1].toFixed(3)}:${target[2].toFixed(3)}:${Array.from(targetQuaternion, (value) => value.toFixed(5)).join(":")}`;
    if (key === this.lastKey) return this.result();

    this.prepareSeeds(current, target);
    let bestCost = Infinity;
    let bestError = Infinity;

    for (let seedIndex = 0; seedIndex < this.seedStates.length; seedIndex += 1) {
      const angles = this.seedStates[seedIndex];
      this.solvePosition(angles, target);
      this.solveOrientation(angles, targetQuaternion);

      const snapshot = this.view.evaluatePose(angles);
      const tcpOffset = this.joints.endEffectorIndex * 3;
      const tcp = snapshot.positions.subarray(tcpOffset, tcpOffset + 3);
      const error = distance3(tcp, target);
      const cost = this.cost(angles, current, error);

      if (cost < bestCost) {
        bestCost = cost;
        bestError = error;
        this.bestAngles.set(angles);
      }
    }

    this.goalAngles.set(this.bestAngles);
    this.lastError = bestError;
    this.lastKey = key;
    return this.result();
  }

  result() {
    return {
      angles: this.goalAngles,
      error: this.lastError,
      reachable: this.lastError <= REACHABLE_ERROR
    };
  }

  prepareSeeds(current, target) {
    const rest = this.joints.restAngles(this.seedStates[4]);
    const base = -Math.atan2(target[2], target[0]);
    this.seedStates[0].set(current);

    this.seedStates[1].set(rest);
    this.seedStates[1][0] = base;
    this.seedStates[1][2] = -90 * Math.PI / 180;
    this.seedStates[1][3] = -40 * Math.PI / 180;
    this.seedStates[1][4] = 65 * Math.PI / 180;

    this.seedStates[2].set(rest);
    this.seedStates[2][0] = base;
    this.seedStates[2][1] = 20 * Math.PI / 180;
    this.seedStates[2][2] = -120 * Math.PI / 180;
    this.seedStates[2][3] = -40 * Math.PI / 180;
    this.seedStates[2][4] = 85 * Math.PI / 180;

    this.seedStates[3].set(rest);
    this.seedStates[3][0] = base;
    this.seedStates[3][1] = -20 * Math.PI / 180;
    this.seedStates[3][2] = -70 * Math.PI / 180;
    this.seedStates[3][3] = -25 * Math.PI / 180;
    this.seedStates[3][4] = 45 * Math.PI / 180;
  }

  solvePosition(angles, target) {
    for (let iteration = 0; iteration < this.joints.ik.goalIterations; iteration += 1) {
      const snapshot = this.view.evaluatePose(angles);
      const tcpOffset = this.joints.endEffectorIndex * 3;
      const positions = snapshot.positions;

      this.error[0] = (target[0] - positions[tcpOffset]) * POSITION_ERROR_GAIN;
      this.error[1] = (target[1] - positions[tcpOffset + 1]) * POSITION_ERROR_GAIN;
      this.error[2] = (target[2] - positions[tcpOffset + 2]) * POSITION_ERROR_GAIN;
      limit3(this.error, POSITION_ERROR_LIMIT);

      this.solveDls(snapshot, this.error, "arm", "positionWeight", POSITION_DAMPING, false);

      if (Math.hypot(this.error[0], this.error[1], this.error[2]) > this.joints.ik.wristAssistError) {
        this.addWristAssist(snapshot);
      }

      this.applyVelocity(angles, 0.035);
    }
  }

  solveOrientation(angles, targetQuaternion) {
    for (let iteration = 0; iteration < this.joints.ik.orientationIterations; iteration += 1) {
      const snapshot = this.view.evaluatePose(angles);
      const quaternionOffset = this.joints.endEffectorIndex * 4;
      const currentQuaternion = snapshot.quaternions.subarray(quaternionOffset, quaternionOffset + 4);

      rotationErrorVector(this.rotationError, currentQuaternion, targetQuaternion);
      this.rotationError[0] *= 0.8;
      this.rotationError[1] *= 0.8;
      this.rotationError[2] *= 0.8;
      limit3(this.rotationError, 0.8);

      this.solveDls(snapshot, this.rotationError, "wrist", "orientationWeight", 0.6, true);
      this.applyVelocity(angles, 0.03);
    }
  }

  solveDls(snapshot, error, group, weightName, damping, angularOnly) {
    const dampingSquared = damping * damping;
    const matrix = this.matrix;
    matrix.fill(0);
    matrix[0] = dampingSquared;
    matrix[4] = dampingSquared;
    matrix[8] = dampingSquared;
    this.velocity.fill(0);

    for (let index = 0; index < this.joints.count; index += 1) {
      const config = this.joints.configs[index];
      if (config.group !== group) continue;

      this.columnVector(snapshot, index, angularOnly, this.vector);
      const weight = config[weightName];
      const x = this.vector[0];
      const y = this.vector[1];
      const z = this.vector[2];

      matrix[0] += weight * x * x;
      matrix[1] += weight * x * y;
      matrix[2] += weight * x * z;
      matrix[3] += weight * y * x;
      matrix[4] += weight * y * y;
      matrix[5] += weight * y * z;
      matrix[6] += weight * z * x;
      matrix[7] += weight * z * y;
      matrix[8] += weight * z * z;
    }

    solveSymmetric3(matrix, error, this.solution);

    for (let index = 0; index < this.joints.count; index += 1) {
      const config = this.joints.configs[index];
      if (config.group !== group) continue;

      this.columnVector(snapshot, index, angularOnly, this.vector);
      this.velocity[index] = config[weightName] * (
        this.vector[0] * this.solution[0]
        + this.vector[1] * this.solution[1]
        + this.vector[2] * this.solution[2]
      );
    }
  }

  columnVector(snapshot, index, angularOnly, out) {
    const axisOffset = index * 3;
    const quaternionOffset = index * 4;
    rotateByQuaternion(
      this.axis,
      this.joints.axes[axisOffset],
      this.joints.axes[axisOffset + 1],
      this.joints.axes[axisOffset + 2],
      snapshot.quaternions,
      quaternionOffset
    );

    if (angularOnly) {
      out.set(this.axis);
      return out;
    }

    const positionOffset = index * 3;
    const tcpOffset = this.joints.endEffectorIndex * 3;
    const rx = snapshot.positions[tcpOffset] - snapshot.positions[positionOffset];
    const ry = snapshot.positions[tcpOffset + 1] - snapshot.positions[positionOffset + 1];
    const rz = snapshot.positions[tcpOffset + 2] - snapshot.positions[positionOffset + 2];

    out[0] = this.axis[1] * rz - this.axis[2] * ry;
    out[1] = this.axis[2] * rx - this.axis[0] * rz;
    out[2] = this.axis[0] * ry - this.axis[1] * rx;
    return out;
  }

  addWristAssist(snapshot) {
    for (let index = 0; index < this.joints.count; index += 1) {
      if (this.joints.configs[index].group !== "wrist") continue;
      this.columnVector(snapshot, index, false, this.vector);
      this.velocity[index] += (
        this.vector[0] * this.error[0]
        + this.vector[1] * this.error[1]
        + this.vector[2] * this.error[2]
      ) * WRIST_ASSIST_GAIN;
    }
  }

  applyVelocity(angles, dt) {
    for (let index = 0; index < this.joints.count; index += 1) {
      const config = this.joints.configs[index];
      const maxVelocity = this.joints.motion.maxVelocity * config.velocityScale;
      const value = this.joints.clamp(this.velocity[index], -maxVelocity, maxVelocity);
      angles[index] = this.joints.clamp(angles[index] + value * dt, config.min, config.max);
    }
  }

  cost(angles, current, positionError) {
    let value = positionError * 7.5;

    for (let index = 0; index < this.joints.count; index += 1) {
      const config = this.joints.configs[index];
      const range = Math.max(config.max - config.min, 1e-6);
      const center = (config.min + config.max) * 0.5;
      const limit = Math.abs((angles[index] - center) / (range * 0.5));

      value += Math.abs(this.joints.angleWrap(angles[index] - current[index])) * 0.8;
      value += Math.abs(this.joints.angleWrap(angles[index] - config.rest)) * 0.25;
      value += Math.max(0, limit - 0.75) ** 2 * 30;
    }

    value += Math.max(0, Math.abs(angles[0]) - 125 * Math.PI / 180) ** 2 * 60;
    value += Math.max(0, -70 * Math.PI / 180 - angles[1]) ** 2 * 90;
    return value;
  }
}

export {
  LEGACY_TO_MILLIMETERS,
  POSITION_DAMPING,
  REACHABLE_ERROR
};
