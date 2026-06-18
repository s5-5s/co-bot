export const createAngles = (jointsConfig, source) => {
  const result = {};
  for (const name in jointsConfig) result[name] = source?.[name] ?? jointsConfig[name].rest ?? 0;
  return result;
};

export const createVelocity = (jointsConfig) => {
  const result = {};
  for (const name in jointsConfig) result[name] = 0;
  return result;
};

export const createState = ({ setup, jointsConfig }) => ({
  target: setup.target,
  targetStart: setup.target.clone(),
  targetDraft: { x: setup.target.x, y: setup.target.y, z: setup.target.z },
  targetQuaternion: setup.targetQuaternion,
  targetQuaternionStart: setup.targetQuaternion.clone(),
  controlMode: "target",
  qActual: createAngles(jointsConfig),
  qCommand: createAngles(jointsConfig),
  qDotCommand: createVelocity(jointsConfig),
  qDotActual: createVelocity(jointsConfig),
  fkPose: null,
  ikError: Infinity,
  ikRotationError: 0,
  ghostVisible: false
});
