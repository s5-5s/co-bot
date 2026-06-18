import * as THREE from "three";

const jointAxisWorld = ({ joint, axis }) => {
  const quaternion = new THREE.Quaternion();

  joint.getWorldQuaternion(quaternion);

  return axis.clone().normalize().applyQuaternion(quaternion).normalize();
};

export const ikJacobianGet = ({ model, joints, axes, jointsConfig, names, endEffectorName }) => {
  const endEffector = joints[endEffectorName] ?? model.getObjectByName(endEffectorName);
  const endPosition = new THREE.Vector3();

  model.updateMatrixWorld(true);
  endEffector.getWorldPosition(endPosition);

  return names.map((name) => {
    const joint = joints[name];
    const jointPosition = new THREE.Vector3();
    const axisWorld = jointAxisWorld({ joint, axis: axes[name] });
    const radius = endPosition.clone();

    joint.getWorldPosition(jointPosition);
    radius.sub(jointPosition);

    return {
      name,
      config: jointsConfig[name],
      linear: axisWorld.clone().cross(radius),
      angular: axisWorld
    };
  });
};
