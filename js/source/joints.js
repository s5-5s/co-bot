const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

const NAMES = Object.freeze(["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"]);
const CONFIG = Object.freeze([
  Object.freeze({ axis: "x", group: "arm", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.55, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 }),
  Object.freeze({ axis: "x", group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 }),
  Object.freeze({ axis: "x", group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 }),
  Object.freeze({ axis: "z", group: "wrist", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.25, orientationWeight: 0.75, velocityScale: 1.2, accelerationScale: 1.15 }),
  Object.freeze({ axis: "z", group: "wrist", min: -140 * TO_RAD, max: 140 * TO_RAD, rest: 0, positionWeight: 0.3, orientationWeight: 0.9, velocityScale: 1.2, accelerationScale: 1.15 }),
  Object.freeze({ axis: "x", group: "wrist", min: -180 * TO_RAD, max: 180 * TO_RAD, rest: 0, positionWeight: 0.02, orientationWeight: 0.45, velocityScale: 0.8, accelerationScale: 0.85 })
]);

const AXES = new Float64Array([
  1, 0, 0,
  1, 0, 0,
  1, 0, 0,
  0, 0, 1,
  0, 0, 1,
  1, 0, 0
]);

const MOTION = Object.freeze({
  kp: 3.8,
  maxVelocity: 2.35,
  maxAcceleration: 6.5,
  velocityFilter: 0.32
});

const WORKSPACE = Object.freeze({
  minRadius: 1000 / 15,
  maxRadius: 2000,
  minY: -8000 / 15,
  maxY: 2000
});

const IK = Object.freeze({
  goalIterations: 100,
  orientationIterations: 35,
  wristAssistError: 800 / 15
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default class Joints {
  constructor() {
    this.names = NAMES;
    this.count = NAMES.length;
    this.endEffector = NAMES[NAMES.length - 1];
    this.endEffectorIndex = NAMES.length - 1;
    this.configs = CONFIG;
    this.axes = AXES;
    this.motion = MOTION;
    this.workspace = WORKSPACE;
    this.ik = IK;
    this.toDeg = TO_DEG;
  }

  createState(source) {
    const state = new Float64Array(this.count);
    if (source) state.set(source);
    return state;
  }

  restAngles(out = this.createState()) {
    for (let index = 0; index < this.count; index += 1) out[index] = this.configs[index].rest;
    return out;
  }

  createRecord() {
    return {
      joint1: 0,
      joint2: 0,
      joint3: 0,
      joint4: 0,
      joint5: 0,
      joint6: 0
    };
  }

  toRecord(angles, out = this.createRecord()) {
    out.joint1 = angles[0];
    out.joint2 = angles[1];
    out.joint3 = angles[2];
    out.joint4 = angles[3];
    out.joint5 = angles[4];
    out.joint6 = angles[5];
    return out;
  }

  openSimDefinitions() {
    const definitions = new Array(this.count);

    for (let index = 0; index < this.count; index += 1) {
      definitions[index] = {
        id: this.names[index],
        unit: "rad",
        map: {
          node: this.names[index],
          rotate: this.configs[index].axis
        }
      };
    }

    return definitions;
  }

  moveAnglesToGoal(current, goal, velocity, dt, outAngles, outVelocity) {
    const motion = this.motion;

    for (let index = 0; index < this.count; index += 1) {
      const config = this.configs[index];
      const maxVelocity = motion.maxVelocity * config.velocityScale;
      const maxAcceleration = motion.maxAcceleration * config.accelerationScale;
      const oldVelocity = velocity[index];
      const error = this.angleWrap(goal[index] - current[index]);
      const wantedVelocity = clamp(error * motion.kp, -maxVelocity, maxVelocity);
      const smoothVelocity = oldVelocity + (wantedVelocity - oldVelocity) * motion.velocityFilter;
      const nextVelocity = clamp(
        smoothVelocity,
        oldVelocity - maxAcceleration * dt,
        oldVelocity + maxAcceleration * dt
      );

      outVelocity[index] = clamp(nextVelocity, -maxVelocity, maxVelocity);
      outAngles[index] = clamp(current[index] + outVelocity[index] * dt, config.min, config.max);
    }

    return outAngles;
  }

  limitTargetWorkspace(target) {
    const workspace = this.workspace;
    const x = target[0];
    const y = target[1];
    const z = target[2];
    const distance = Math.hypot(x, y, z);
    let changed = false;

    if (distance > 1e-9) {
      const radius = clamp(distance, workspace.minRadius, workspace.maxRadius);

      if (Math.abs(radius - distance) > 1e-9) {
        const scale = radius / distance;
        target[0] *= scale;
        target[1] *= scale;
        target[2] *= scale;
        changed = true;
      }
    }

    const limitedY = clamp(target[1], workspace.minY, workspace.maxY);
    if (limitedY !== target[1]) {
      target[1] = limitedY;
      changed = true;
    }

    return changed;
  }

  maxAngleError(current, target) {
    let maximum = 0;

    for (let index = 0; index < this.count; index += 1) {
      maximum = Math.max(maximum, Math.abs(this.angleWrap(target[index] - current[index])));
    }

    return maximum;
  }

  maxSpeed(velocity) {
    let maximum = 0;
    for (let index = 0; index < this.count; index += 1) maximum = Math.max(maximum, Math.abs(velocity[index]));
    return maximum;
  }

  angleWrap(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  clamp(value, min, max) {
    return clamp(value, min, max);
  }
}

export { TO_DEG, TO_RAD, WORKSPACE };
