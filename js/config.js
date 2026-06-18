import * as THREE from "three";

export const TO_RAD = Math.PI / 180;
export const TO_DEG = 180 / Math.PI;

export const CONFIG = {
  frequency: { fk: 100, ik: 100, render: 60 },
  model: {
    path: "../models/co-bot.gltf",
    endEffector: "joint6",
    position: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(15, 15, 15)
  },
  scene: {
    cameraPosition: new THREE.Vector3(15, 40, 15),
    cameraLookAt: new THREE.Vector3(0, 0, 0),
    axisLength: 20,
    axisLabelLength: 23,
    ghostColor: 0xcc5555,
    ghostSyncEpsilon: 0.01
  },
  workspace: {
    base: new THREE.Vector3(0, 0, 0),
    minRadius: 1,
    maxRadius: 30,
    minY: -8,
    maxY: 30
  },
  motion: {
    kp: 3.8,
    maxVelocity: 2.35,
    maxAcceleration: 6.5,
    velocityFilter: 0.32,
    actualVelocityScale: 4.5
  },
  ik: {
    useOrientation: true,
    goalIterations: 100,
    goalOrientationIterations: 35,
    wristAssistError: 0.8
  }
};

export const JOINTS_CONFIG = {
  joint1: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.55, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
  joint2: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
  joint3: { axis: new THREE.Vector3(1, 0, 0), group: "arm", min: -150 * TO_RAD, max: 150 * TO_RAD, rest: 0, positionWeight: 0.9, orientationWeight: 0, velocityScale: 1, accelerationScale: 1 },
  joint4: { axis: new THREE.Vector3(0, 0, 1), group: "wrist", min: -170 * TO_RAD, max: 170 * TO_RAD, rest: 0, positionWeight: 0.25, orientationWeight: 0.75, velocityScale: 1.2, accelerationScale: 1.15 },
  joint5: { axis: new THREE.Vector3(0, 0, 1), group: "wrist", min: -140 * TO_RAD, max: 140 * TO_RAD, rest: 0, positionWeight: 0.3, orientationWeight: 0.9, velocityScale: 1.2, accelerationScale: 1.15 },
  joint6: { axis: new THREE.Vector3(1, 0, 0), group: "wrist", min: -180 * TO_RAD, max: 180 * TO_RAD, rest: 0, positionWeight: 0.02, orientationWeight: 0.45, velocityScale: 0.8, accelerationScale: 0.85 }
};
