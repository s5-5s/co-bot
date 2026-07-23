import OpenSim from "../modules/open-sim.js";

const METERS_TO_MILLIMETERS = 1000;
const TCP_COLORS = Object.freeze({
  idle: "#e8edf2",
  moving: "#ffd84d",
  reached: "#42d392",
  error: "#ff626e"
});

export default class RobotView {
  constructor(simulation, commandPose, joints) {
    this.simulation = simulation;
    this.commandPose = commandPose;
    this.joints = joints;
    this.actualRecord = joints.createRecord();
    this.commandRecord = joints.createRecord();
    this.evaluationRecord = joints.createRecord();
    this.snapshot = {
      positions: new Float64Array(joints.count * 3),
      quaternions: new Float64Array(joints.count * 4)
    };
    this.nodeTransform = {
      position: new Float64Array(3),
      quaternion: new Float64Array(4)
    };
    this.tcpState = "";
    this.commandVisible = false;
    this.destroyed = false;
  }

  static async create(container, joints, options = {}) {
    const model = options.model ?? new URL("../../models/co-bot.gltf", import.meta.url);
    const simulation = await OpenSim.create(container, {
      model,
      joints: joints.openSimDefinitions()
    });

    const nodes = new Set(simulation.listNodes());
    for (let index = 0; index < joints.count; index += 1) {
      const name = joints.names[index];
      if (!nodes.has(name)) {
        simulation.destroy();
        throw new Error(`В модели не найден обязательный узел «${name}»`);
      }
    }

    const commandPose = simulation.addPose({ color: "#d6545d", opacity: 0.28 });
    commandPose.setVisible(false);
    return new RobotView(simulation, commandPose, joints);
  }

  evaluatePose(angles) {
    this.assertActive();
    this.simulation.setJoints(this.joints.toRecord(angles, this.evaluationRecord));

    const positions = this.snapshot.positions;
    const quaternions = this.snapshot.quaternions;

    for (let index = 0; index < this.joints.count; index += 1) {
      const transform = this.simulation.getNodeWorldTransform(this.joints.names[index]);
      const positionOffset = index * 3;
      const quaternionOffset = index * 4;

      positions[positionOffset] = transform.position[0] * METERS_TO_MILLIMETERS;
      positions[positionOffset + 1] = transform.position[1] * METERS_TO_MILLIMETERS;
      positions[positionOffset + 2] = transform.position[2] * METERS_TO_MILLIMETERS;
      quaternions[quaternionOffset] = transform.quaternion[0];
      quaternions[quaternionOffset + 1] = transform.quaternion[1];
      quaternions[quaternionOffset + 2] = transform.quaternion[2];
      quaternions[quaternionOffset + 3] = transform.quaternion[3];
    }

    return this.snapshot;
  }

  present(actual, command, showCommand) {
    this.assertActive();
    this.simulation.setJoints(this.joints.toRecord(actual, this.actualRecord));
    this.commandPose.setJoints(this.joints.toRecord(command, this.commandRecord));

    if (showCommand !== this.commandVisible) {
      this.commandVisible = showCommand;
      this.commandPose.setVisible(showCommand);
    }
  }

  getNodeTransform(name, out = this.nodeTransform) {
    this.assertActive();
    const transform = this.simulation.getNodeWorldTransform(name);

    out.position[0] = transform.position[0] * METERS_TO_MILLIMETERS;
    out.position[1] = transform.position[1] * METERS_TO_MILLIMETERS;
    out.position[2] = transform.position[2] * METERS_TO_MILLIMETERS;
    out.quaternion[0] = transform.quaternion[0];
    out.quaternion[1] = transform.quaternion[1];
    out.quaternion[2] = transform.quaternion[2];
    out.quaternion[3] = transform.quaternion[3];
    return out;
  }

  setTcpState(state) {
    this.assertActive();
    if (state === this.tcpState) return;

    const color = TCP_COLORS[state] ?? TCP_COLORS.idle;
    this.simulation.setNodeAppearance(this.joints.endEffector, { color });
    this.tcpState = state;
  }

  fitCamera() {
    this.assertActive();
    this.simulation.fitCamera();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.commandPose.remove();
    this.simulation.destroy();
  }

  assertActive() {
    if (this.destroyed) throw new Error("RobotView уже уничтожен");
  }
}

export { METERS_TO_MILLIMETERS, TCP_COLORS };
