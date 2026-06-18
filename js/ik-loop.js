import { modelCalculateIK } from "./ik/model-calculate-ik.js";
import { limitTargetWorkspace } from "./model.js";

export const ikLoop = ({ setup, jointsConfig, config, state, frequency }) => {
  let previousTime = performance.now();

  const update = () => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;

    limitTargetWorkspace({ target: state.target, ...config.workspace });

    const result = modelCalculateIK({
      model: setup.model,
      ...setup.modelJoints,
      jointsConfig,
      qActual: state.qActual,
      qCommand: state.qCommand,
      qDotPrevious: state.qDotCommand,
      target: state.target,
      targetQuaternion: config.ik.useOrientation ? state.targetQuaternion : null,
      dt,
      mode: state.controlMode,
      endEffectorName: config.model.endEffector,
      config: { ...config.ik, ...config.motion }
    });

    state.qCommand = result.angles;
    state.qDotCommand = result.velocity;
    state.ikError = result.error;
    state.ikRotationError = result.rotationError;

    if (state.controlMode === "home" && result.homeError < 0.001) state.controlMode = "target";
  };

  update();
  return setInterval(update, 1000 / frequency);
};
