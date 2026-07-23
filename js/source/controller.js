import { copy3, copy4, distance3 } from "./math.js";

const REACHED_POSITION_ERROR = 2;
const REACHED_SPEED = 0.5 * Math.PI / 180;
const SETTLED_ANGLE_ERROR = 0.001;
const COMMAND_POSE_ERROR = 0.01;

export default class Controller {
  constructor({ ui, view, joints, solver }) {
    this.ui = ui;
    this.view = view;
    this.joints = joints;
    this.solver = solver;
    this.actual = joints.restAngles();
    this.command = joints.restAngles();
    this.velocity = joints.createState();
    this.nextActual = joints.createState();
    this.nextVelocity = joints.createState();
    this.target = new Float64Array(3);
    this.targetQuaternion = new Float64Array(4);
    this.actualPosition = new Float64Array(3);
    this.plannedError = 0;
    this.positionError = 0;
    this.warning = "";
    this.status = "loading";
    this.animationFrame = 0;
    this.previousTime = 0;
    this.running = false;

    this.handleTarget = (target) => this.setTarget(target);
    this.handleHome = () => this.goHome();
    this.handleFit = () => this.view.fitCamera();
    this.handlePageHide = () => this.destroy();
    this.tick = (time) => this.update(time);
  }

  start() {
    if (this.running) return;

    this.view.present(this.actual, this.command, false);
    const transform = this.view.getNodeTransform(this.joints.endEffector);
    copy3(this.target, transform.position);
    copy3(this.actualPosition, transform.position);
    copy4(this.targetQuaternion, transform.quaternion);

    this.ui.onTarget(this.handleTarget);
    this.ui.onHome(this.handleHome);
    this.ui.onFitCamera(this.handleFit);
    this.ui.setTarget(this.target);
    this.ui.setLoading(false);

    this.status = "reached";
    this.view.setTcpState("reached");
    this.render();

    this.running = true;
    this.previousTime = performance.now();
    window.addEventListener("pagehide", this.handlePageHide, { once: true });
  }

  setTarget(target) {
    copy3(this.target, target);
    const constrained = this.joints.limitTargetWorkspace(this.target);
    this.ui.setTarget(this.target);
    this.warning = constrained ? "Цель ограничена допустимой рабочей областью." : "";
    this.status = "moving";
    this.ui.setStatus("moving");
    this.ui.setNotice("Вычисляем траекторию…", "info");

    this.view.present(this.actual, this.command, this.joints.maxAngleError(this.actual, this.command) > COMMAND_POSE_ERROR);
    const actualTransform = this.view.getNodeTransform(this.joints.endEffector);
    copy3(this.actualPosition, actualTransform.position);
    copy4(this.targetQuaternion, actualTransform.quaternion);
    this.positionError = distance3(this.actualPosition, this.target);

    const result = this.solver.solve(this.target, this.targetQuaternion, this.actual);
    this.command.set(result.angles);
    this.plannedError = result.error;

    if (!result.reachable) {
      this.status = "error";
      this.warning = `Цель недостижима: расчётная ошибка ${result.error.toFixed(2)} мм.`;
    }

    this.view.present(this.actual, this.command, this.joints.maxAngleError(this.actual, this.command) > COMMAND_POSE_ERROR);
    const settled = this.updateStatus();
    this.render();
    if (!settled) this.ensureAnimation();
  }

  goHome() {
    this.joints.restAngles(this.command);
    this.solver.reset();
    this.plannedError = 0;
    this.warning = "";

    const snapshot = this.view.evaluatePose(this.command);
    const positionOffset = this.joints.endEffectorIndex * 3;
    const quaternionOffset = this.joints.endEffectorIndex * 4;
    this.target[0] = snapshot.positions[positionOffset];
    this.target[1] = snapshot.positions[positionOffset + 1];
    this.target[2] = snapshot.positions[positionOffset + 2];
    this.targetQuaternion[0] = snapshot.quaternions[quaternionOffset];
    this.targetQuaternion[1] = snapshot.quaternions[quaternionOffset + 1];
    this.targetQuaternion[2] = snapshot.quaternions[quaternionOffset + 2];
    this.targetQuaternion[3] = snapshot.quaternions[quaternionOffset + 3];

    this.ui.setTarget(this.target);
    this.view.present(this.actual, this.command, this.joints.maxAngleError(this.actual, this.command) > COMMAND_POSE_ERROR);
    const actualTransform = this.view.getNodeTransform(this.joints.endEffector);
    copy3(this.actualPosition, actualTransform.position);
    this.positionError = distance3(this.actualPosition, this.target);
    const settled = this.updateStatus();
    this.render();
    if (!settled) this.ensureAnimation();
  }

  update(time) {
    if (!this.running) return;
    this.animationFrame = 0;

    const dt = Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;

    this.joints.moveAnglesToGoal(
      this.actual,
      this.command,
      this.velocity,
      dt,
      this.nextActual,
      this.nextVelocity
    );

    const previousActual = this.actual;
    this.actual = this.nextActual;
    this.nextActual = previousActual;

    const previousVelocity = this.velocity;
    this.velocity = this.nextVelocity;
    this.nextVelocity = previousVelocity;

    const commandVisible = this.joints.maxAngleError(this.actual, this.command) > COMMAND_POSE_ERROR;
    this.view.present(this.actual, this.command, commandVisible);
    const transform = this.view.getNodeTransform(this.joints.endEffector);
    copy3(this.actualPosition, transform.position);
    this.positionError = distance3(this.actualPosition, this.target);

    const settled = this.updateStatus();
    this.render();
    if (!settled) this.ensureAnimation();
  }

  updateStatus() {
    const jointError = this.joints.maxAngleError(this.actual, this.command);
    const speed = this.joints.maxSpeed(this.velocity);
    const settled = jointError <= SETTLED_ANGLE_ERROR && speed <= REACHED_SPEED;

    if (this.plannedError > 5) {
      this.status = "error";
    } else if (settled) {
      this.status = this.positionError <= REACHED_POSITION_ERROR ? "reached" : "error";
      if (this.status === "error" && !this.warning) {
        this.warning = `Точность не достигнута: ошибка ${this.positionError.toFixed(2)} мм.`;
      }
    } else {
      this.status = "moving";
    }

    this.view.setTcpState(this.status === "error" ? "error" : this.status);
    return settled;
  }

  ensureAnimation() {
    if (!this.running || this.animationFrame) return;
    this.previousTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  render() {
    let message = this.warning;
    let tone = this.warning ? "warning" : "info";

    if (this.status === "reached" && !message) message = "Манипулятор находится в заданной позиции.";
    if (this.status === "moving" && !message) message = "Выполняется движение к командной позе.";
    if (this.status === "error") tone = "error";

    this.ui.render({
      position: this.actualPosition,
      angles: this.actual,
      error: this.positionError,
      status: this.status,
      message,
      tone
    });
  }

  destroy() {
    if (!this.running) return;
    this.running = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    window.removeEventListener("pagehide", this.handlePageHide);
    this.ui.destroy();
    this.view.destroy();
  }
}

export {
  COMMAND_POSE_ERROR,
  REACHED_POSITION_ERROR,
  REACHED_SPEED,
  SETTLED_ANGLE_ERROR
};
