import { ikGoalCreate } from "./ik-goal-create.js";
import { anglesClone, anglesRest } from "./ik-angle-utils.js";
import { setJointsAngles } from "../model.js";
import { modelCalculateFK } from "../fk/model-calculate-fk.js";
import { moveAnglesToGoal } from "../kinematics.js";

let goalKey = "";
let goalAngles = null;

const keyCreate = ({ target, mode }) => `${mode}:${target.x.toFixed(3)}:${target.y.toFixed(3)}:${target.z.toFixed(3)}`;

const goalByMode = (options) => {
  if (options.mode === "home") {
    goalKey = "home";
    goalAngles = anglesRest(options.jointsConfig);
    return goalAngles;
  }

  const key = keyCreate({ target: options.target, mode: options.mode });
  if (key !== goalKey || !goalAngles) {
    goalAngles = ikGoalCreate(options);
    goalKey = key;
  }
  return goalAngles;
};

export const modelCalculateIK = (options) => {
  const current = anglesClone(options.qCommand ?? options.qActual, options.jointsConfig);
  const velocity = anglesClone(options.qDotPrevious, options.jointsConfig);

  if (!Number.isFinite(options.dt) || options.dt <= 0) {
    return { angles: current, velocity, error: 0, rotationError: 0, homeError: 0 };
  }

  const goal = goalByMode({ ...options, current: options.qActual ?? options.qCommand });
  const result = moveAnglesToGoal({
    current,
    goal,
    velocity,
    jointsConfig: options.jointsConfig,
    config: options.config,
    dt: options.dt
  });

  setJointsAngles({ joints: options.joints, initialQuaternions: options.initialQuaternions, axes: options.axes, angles: result.angles });

  const pose = modelCalculateFK({ model: options.model, joints: options.joints, endEffectorName: options.endEffectorName });
  const error = pose ? options.target.distanceTo(pose.position) : Infinity;
  let homeError = 0;

  for (const name in options.jointsConfig) homeError = Math.max(homeError, Math.abs((goal[name] ?? 0) - (result.angles[name] ?? 0)));

  return { angles: result.angles, velocity: result.velocity, error, rotationError: 0, homeError };
};
