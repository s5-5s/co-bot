import { angleWrap, clamp } from "./ik/ik-angle-utils.js";
import { createAngles } from "./state.js";

export const moveAnglesToGoal = ({ current, goal, velocity, jointsConfig, config, dt, speedScale = 1 }) => {
  const angles = createAngles(jointsConfig, current);
  const nextVelocity = createAngles(jointsConfig, velocity);

  for (const name in jointsConfig) {
    const joint = jointsConfig[name];
    const maxVelocity = config.maxVelocity * (joint.velocityScale ?? 1) * speedScale;
    const maxAcceleration = config.maxAcceleration * (joint.accelerationScale ?? 1) * speedScale;
    const oldVelocity = nextVelocity[name] ?? 0;
    const error = angleWrap((goal[name] ?? 0) - (current[name] ?? 0));
    const wantedVelocity = clamp(error * config.kp * speedScale, -maxVelocity, maxVelocity);
    const smoothVelocity = oldVelocity + (wantedVelocity - oldVelocity) * config.velocityFilter;

    nextVelocity[name] = clamp(
      smoothVelocity,
      oldVelocity - maxAcceleration * dt,
      oldVelocity + maxAcceleration * dt
    );
    nextVelocity[name] = clamp(nextVelocity[name], -maxVelocity, maxVelocity);
    angles[name] = clamp((current[name] ?? 0) + nextVelocity[name] * dt, joint.min, joint.max);
  }

  return { angles, velocity: nextVelocity };
};
