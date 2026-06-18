import { setJointsAngles } from "../model.js";
import { modelCalculateFK } from "../fk/model-calculate-fk.js";
import { ikJacobianGet } from "./ik-jacobian-get.js";
import { ikDlsSolve } from "./ik-dls-solve.js";
import { angleWrap, anglesClone, anglesRest, clamp, rotationErrorVector, vectorLimit } from "./ik-angle-utils.js";

const preferredBase = (target) => -Math.atan2(target.z, target.x);

const seedList = ({ current, target, jointsConfig }) => {
  const rest = anglesRest(jointsConfig);
  const base = preferredBase(target);

  return [
    anglesClone(current, jointsConfig),
    { ...rest, joint1: base, joint2: 0, joint3: -90 * Math.PI / 180, joint4: -40 * Math.PI / 180, joint5: 65 * Math.PI / 180 },
    { ...rest, joint1: base, joint2: 20 * Math.PI / 180, joint3: -120 * Math.PI / 180, joint4: -40 * Math.PI / 180, joint5: 85 * Math.PI / 180 },
    { ...rest, joint1: base, joint2: -20 * Math.PI / 180, joint3: -70 * Math.PI / 180, joint4: -25 * Math.PI / 180, joint5: 45 * Math.PI / 180 },
    rest
  ];
};

const applyVelocity = ({ angles, velocity, names, jointsConfig, config, dt }) => {
  for (const name of names) {
    const joint = jointsConfig[name];
    const maxVelocity = (config?.maxVelocity ?? 1.35) * (joint.velocityScale ?? 1);
    const v = clamp(velocity[name] ?? 0, -maxVelocity, maxVelocity);

    angles[name] = clamp((angles[name] ?? 0) + v * dt, joint.min, joint.max);
  }
};

const solveStage = ({ model, joints, initialQuaternions, axes, jointsConfig, angles, names, target, targetQuaternion, config, endEffectorName }) => {
  for (let i = 0; i < (config.goalIterations ?? 90); i++) {
    setJointsAngles({ joints, initialQuaternions, axes, angles });

    const pose = modelCalculateFK({ model, joints, endEffectorName });
    const error = target.clone().sub(pose.position);
    const columns = ikJacobianGet({ model, joints, axes, jointsConfig, names, endEffectorName })
      .filter((c) => c.config.group === "arm")
      .map((c) => ({ ...c, vector: c.linear }));
    const velocity = ikDlsSolve({ columns, error: vectorLimit(error.multiplyScalar(5), 12), damping: 0.35, weightName: "positionWeight" });

    if (error.length() > (config.wristAssistError ?? 0.8)) {
      for (const c of ikJacobianGet({ model, joints, axes, jointsConfig, names, endEffectorName }).filter((v) => v.config.group === "wrist")) {
        velocity[c.name] = (velocity[c.name] ?? 0) + c.linear.dot(error) * 0.015;
      }
    }

    applyVelocity({ angles, velocity, names, jointsConfig, config, dt: 0.035 });
  }

  if (!targetQuaternion) return;

  for (let i = 0; i < (config.goalOrientationIterations ?? 30); i++) {
    setJointsAngles({ joints, initialQuaternions, axes, angles });

    const pose = modelCalculateFK({ model, joints, endEffectorName });
    const error = rotationErrorVector({ current: pose.quaternion, target: targetQuaternion });
    const columns = ikJacobianGet({ model, joints, axes, jointsConfig, names, endEffectorName })
      .filter((c) => c.config.group === "wrist")
      .map((c) => ({ ...c, vector: c.angular }));
    const velocity = ikDlsSolve({ columns, error: vectorLimit(error.multiplyScalar(0.8), 0.8), damping: 0.6, weightName: "orientationWeight" });

    applyVelocity({ angles, velocity, names, jointsConfig, config, dt: 0.03 });
  }
};

const cost = ({ angles, current, pose, target, jointsConfig }) => {
  let value = target.distanceTo(pose.position) * 500;

  for (const name in jointsConfig) {
    const joint = jointsConfig[name];
    const range = Math.max(joint.max - joint.min, 1e-6);
    const center = (joint.min + joint.max) * 0.5;
    const limit = Math.abs((angles[name] - center) / (range * 0.5));

    value += Math.abs(angleWrap(angles[name] - (current[name] ?? 0))) * 0.8;
    value += Math.abs(angleWrap(angles[name] - (joint.rest ?? 0))) * 0.25;
    value += Math.max(0, limit - 0.75) ** 2 * 30;
  }

  value += Math.max(0, Math.abs(angles.joint1 ?? 0) - 125 * Math.PI / 180) ** 2 * 60;
  value += Math.max(0, -70 * Math.PI / 180 - (angles.joint2 ?? 0)) ** 2 * 90;

  return value;
};

export const ikGoalCreate = (options) => {
  const names = Object.keys(options.jointsConfig);
  const current = anglesClone(options.current, options.jointsConfig);
  let best = null;

  for (const seed of seedList({ current, target: options.target, jointsConfig: options.jointsConfig })) {
    const angles = anglesClone(seed, options.jointsConfig);

    solveStage({ ...options, angles, names });
    setJointsAngles({ joints: options.joints, initialQuaternions: options.initialQuaternions, axes: options.axes, angles });

    const pose = modelCalculateFK({ model: options.model, joints: options.joints, endEffectorName: options.endEffectorName });
    const candidate = { angles, cost: cost({ angles, current, pose, target: options.target, jointsConfig: options.jointsConfig }) };

    if (!best || candidate.cost < best.cost) best = candidate;
  }

  return best?.angles ?? current;
};
