import * as THREE from "three";

const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();

export const modelCalculateFK = ({
  model,
  joints,
  endEffectorName = "joint6"
}) => {
  if (!model || !joints) {
    return null;
  }

  model.updateMatrixWorld(true);

  // FK в three.js уже считается через scene graph.
  // Нам нужно только взять world transform последнего звена.
  const endEffector = joints[endEffectorName] ?? model.getObjectByName(endEffectorName);

  if (!endEffector) {
    console.warn(`${endEffectorName} не найден`);
    return null;
  }

  endEffector.getWorldPosition(position);
  endEffector.getWorldQuaternion(quaternion);

  return {
    position: position.clone(),
    quaternion: quaternion.clone()
  };
};
