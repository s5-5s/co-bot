import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadModel, makeModelBeauty, createGhostModel, createModelJoints, setJointsAngles } from "./model.js";
import { modelCalculateFK } from "./fk/model-calculate-fk.js";
import { createAngles } from "./state.js";

const createGrid = () => {
  const grid = new THREE.GridHelper(200, 40, 0xcc5555, 0xcc5555);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  return grid;
};

const createAxisLabel = (text, color, position) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 128;
  canvas.height = 128;
  ctx.fillStyle = color;
  ctx.font = "bold 56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.position.copy(position);
  sprite.scale.set(5, 5, 1);
  return sprite;
};

const createAxis = ({ direction, color, labelText, labelPosition, length = 25 }) => {
  const axis = new THREE.Group();
  const dir = direction.clone().normalize();
  const material = new THREE.MeshBasicMaterial({ color });
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, length, 16), material);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2, 24), material);

  cylinder.position.copy(dir.clone().multiplyScalar(length / 2));
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cone.position.copy(dir.clone().multiplyScalar(length + 1));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  axis.add(cylinder, cone, createAxisLabel(labelText, `#${color.toString(16).padStart(6, "0")}`, labelPosition));
  return axis;
};

export const createScene = async ({ config, jointsConfig }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(config.scene.cameraPosition);
  camera.lookAt(config.scene.cameraLookAt);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(25, 40, 20);
  light.castShadow = true;
  scene.add(light, createGrid());

  scene.add(
    createAxis({ direction: new THREE.Vector3(1, 0, 0), color: 0xcc5555, labelText: "X", labelPosition: new THREE.Vector3(config.scene.axisLabelLength, 0, 0), length: Number(config.scene.axisLength) }), 
    createAxis({ direction: new THREE.Vector3(0, 1, 0), color: 0x55cc66, labelText: "Y", labelPosition: new THREE.Vector3(0, config.scene.axisLabelLength, 0), length: Number(config.scene.axisLength) }),
    createAxis({ direction: new THREE.Vector3(0, 0, 1), color: 0x5588cc, labelText: "Z", labelPosition: new THREE.Vector3(0, 0, config.scene.axisLabelLength), length: Number(config.scene.axisLength) })
  );

  const model = await loadModel(config.model.path);
  if (!model) return null;

  model.position.copy(config.model.position);
  model.scale.copy(config.model.scale);
  makeModelBeauty(model);
  scene.add(model);

  const modelJoints = createModelJoints(model, jointsConfig);
  setJointsAngles({ ...modelJoints, angles: createAngles(jointsConfig) });

  const startPose = modelCalculateFK({ model, joints: modelJoints.joints, endEffectorName: config.model.endEffector });
  const modelGhost = createGhostModel(model, config.scene.ghostColor);
  const modelGhostJoints = createModelJoints(modelGhost, jointsConfig);
  scene.add(modelGhost);

  const target = startPose?.position?.clone() ?? new THREE.Vector3();
  const targetQuaternion = startPose?.quaternion?.clone() ?? new THREE.Quaternion();
  const targetMarker = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
  targetMarker.position.copy(target);
  scene.add(targetMarker);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, renderer, camera, controls, model, modelJoints, modelGhost, modelGhostJoints, target, targetQuaternion, targetMarker };
};
