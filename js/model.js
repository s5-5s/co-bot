import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const loadModel = async (path) => {
  try {
    return (await new GLTFLoader().loadAsync(path)).scene;
  } catch (error) {
    console.error("Ошибка загрузки модели:", error);
    return null;
  }
};

export const makeModelBeauty = (model) => model?.traverse((object) => {
  if (!object.isMesh || !object.material) return;
  object.castShadow = true;
  object.receiveShadow = true;
  object.material = object.material.clone();
  object.material.roughness = 0.45;
  object.material.metalness = 0.15;
  object.material.envMapIntensity = 1;
  object.material.needsUpdate = true;
});

export const createGhostModel = (model, color) => {
  const ghost = model.clone(true);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });

  ghost.traverse((object) => {
    if (!object.isMesh) return;
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
  });

  ghost.visible = false;
  return ghost;
};

export const createModelJoints = (model, jointsConfig) => {
  const joints = {}, initialQuaternions = {}, axes = {};

  for (const name in jointsConfig) {
    const joint = model.getObjectByName(name);
    joints[name] = joint;
    if (!joint) {
      console.warn(`${name} не найден`);
      continue;
    }
    initialQuaternions[name] = joint.quaternion.clone();
    axes[name] = jointsConfig[name].axis.clone();
  }

  return { joints, initialQuaternions, axes };
};

export const setJointsAngles = ({ joints, initialQuaternions, axes, angles }) => {
  for (const name in angles) {
    if (!joints[name] || !initialQuaternions[name] || !axes[name]) continue;
    const rotation = new THREE.Quaternion().setFromAxisAngle(axes[name].clone().normalize(), angles[name]);
    joints[name].quaternion.copy(initialQuaternions[name]).multiply(rotation);
  }
};

export const limitTargetWorkspace = ({ target, base, minRadius, maxRadius, minY, maxY }) => {
  const offset = target.clone().sub(base);
  const distance = offset.length();

  if (distance > 1e-9) {
    const limited = Math.min(maxRadius, Math.max(minRadius, distance));
    target.copy(base).add(offset.multiplyScalar(limited / distance));
  }

  target.y = Math.min(maxY, Math.max(minY, target.y));
  return target;
};
