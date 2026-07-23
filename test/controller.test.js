import test from "node:test";
import assert from "node:assert/strict";
import Controller from "../js/source/controller.js";
import Joints from "../js/source/joints.js";

class FakeUI {
  onTarget(handler) { this.targetHandler = handler; }
  onHome(handler) { this.homeHandler = handler; }
  onFitCamera(handler) { this.fitHandler = handler; }
  setTarget(target) { this.target = Array.from(target); }
  setLoading(loading) { this.loading = loading; }
  setStatus(status) { this.status = status; }
  setNotice(message) { this.notice = message; }
  render(telemetry) { this.telemetry = telemetry; }
  destroy() { this.destroyed = true; }
}

class FakeView {
  constructor(joints) {
    this.joints = joints;
    this.position = new Float64Array(3);
    this.quaternion = new Float64Array([0, 0, 0, 1]);
    this.snapshot = {
      positions: new Float64Array(joints.count * 3),
      quaternions: new Float64Array(joints.count * 4)
    };
    this.snapshot.quaternions[joints.endEffectorIndex * 4 + 3] = 1;
  }

  present(actual) {
    this.position[0] = actual[0] * 100;
  }

  getNodeTransform() {
    return { position: this.position, quaternion: this.quaternion };
  }

  evaluatePose() {
    return this.snapshot;
  }

  setTcpState(state) { this.tcpState = state; }
  fitCamera() { this.fitCalls = (this.fitCalls ?? 0) + 1; }
  destroy() { this.destroyed = true; }
}

class FakeSolver {
  constructor(joints) {
    this.angles = joints.restAngles();
    this.angles[0] = 0.1;
  }

  solve() {
    return { angles: this.angles, error: 0, reachable: true };
  }

  reset() {}
}

test("Controller is idle at home and starts one motion frame for a command", () => {
  const originalWindow = globalThis.window;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let nextFrame = 1;

  globalThis.window = {
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  try {
    const joints = new Joints();
    const ui = new FakeUI();
    const view = new FakeView(joints);
    const controller = new Controller({
      ui,
      view,
      joints,
      solver: new FakeSolver(joints)
    });

    controller.start();
    assert.equal(frames.size, 0);
    assert.equal(ui.telemetry.status, "reached");

    ui.targetHandler(new Float64Array([100, 0, 0]));
    assert.equal(frames.size, 1);
    assert.equal(ui.telemetry.status, "moving");

    const [callback] = frames.values();
    frames.clear();
    callback(performance.now() + 16);
    assert.ok(controller.actual[0] > 0);

    controller.destroy();
    assert.equal(view.destroyed, true);
    assert.equal(ui.destroyed, true);
  } finally {
    globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
