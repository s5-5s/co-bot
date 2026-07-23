import test from "node:test";
import assert from "node:assert/strict";
import IK from "../js/source/ik.js";
import Joints from "../js/source/joints.js";

class StaticView {
  constructor(joints) {
    this.joints = joints;
    this.calls = 0;
    this.snapshot = {
      positions: new Float64Array(joints.count * 3),
      quaternions: new Float64Array(joints.count * 4)
    };

    for (let index = 0; index < joints.count; index += 1) {
      this.snapshot.quaternions[index * 4 + 3] = 1;
    }
  }

  evaluatePose() {
    this.calls += 1;
    return this.snapshot;
  }
}

test("IK recognizes a reached target and caches the result", () => {
  const joints = new Joints();
  const view = new StaticView(joints);
  const solver = new IK(joints, view);
  const target = new Float64Array([0, 0, 0]);
  const orientation = new Float64Array([0, 0, 0, 1]);

  const first = solver.solve(target, orientation, joints.restAngles());
  const callCount = view.calls;
  const second = solver.solve(target, orientation, joints.restAngles());

  assert.equal(first.reachable, true);
  assert.equal(first.error, 0);
  assert.equal(second.error, 0);
  assert.equal(view.calls, callCount);
});

test("IK reports an unreachable target", () => {
  const joints = new Joints();
  const solver = new IK(joints, new StaticView(joints));
  const result = solver.solve(
    new Float64Array([10000, 0, 0]),
    new Float64Array([0, 0, 0, 1]),
    joints.restAngles()
  );

  assert.equal(result.reachable, false);
  assert.equal(result.error, 10000);
});
