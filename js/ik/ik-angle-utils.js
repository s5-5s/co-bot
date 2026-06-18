import * as THREE from "three";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export const vectorLimit = (vector, limit) => {
  const length = vector.length();

  if (length < 1e-9 || length <= limit) return vector;

  return vector.multiplyScalar(limit / length);
};

export const anglesClone = (source, jointsConfig) => {
  const result = {};

  for (const name in jointsConfig) result[name] = source?.[name] ?? jointsConfig[name].rest ?? 0;

  return result;
};

export const anglesRest = (jointsConfig) => {
  const result = {};

  for (const name in jointsConfig) result[name] = jointsConfig[name].rest ?? 0;

  return result;
};

export const rotationErrorVector = ({ current, target }) => {
  const q = target.clone().multiply(current.clone().invert()).normalize();

  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);

  const v = new THREE.Vector3(q.x, q.y, q.z);
  const length = v.length();

  if (length < 1e-9) return v.multiplyScalar(2);

  return v.multiplyScalar(2 * Math.atan2(length, q.w) / length);
};
