import { setJointsAngles } from "./model.js";
import { modelCalculateFK } from "./fk/model-calculate-fk.js";
import { moveAnglesToGoal } from "./kinematics.js";

export const fkLoop = ({ setup, jointsConfig, config, state, frequency }) => {
  let previousTime = performance.now();

  const update = () => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;

    const result = moveAnglesToGoal({
      current: state.qActual,
      goal: state.qCommand,
      velocity: state.qDotActual,
      jointsConfig,
      config: config.motion,
      speedScale: config.motion.actualVelocityScale,
      dt
    });

    state.qActual = result.angles;
    state.qDotActual = result.velocity;

    let maxError = 0;
    for (const name in jointsConfig) maxError = Math.max(maxError, Math.abs(state.qCommand[name] - state.qActual[name]));

    state.ghostVisible = maxError > config.scene.ghostSyncEpsilon;
    setup.modelGhost.visible = state.ghostVisible;

    setJointsAngles({ ...setup.modelGhostJoints, angles: state.qActual });
    state.fkPose = modelCalculateFK({ model: setup.modelGhost, joints: setup.modelGhostJoints.joints, endEffectorName: config.model.endEffector });
  };

  update();
  return setInterval(update, 1000 / frequency);
};
