import test from "node:test";
import assert from "node:assert/strict";
import Joints, { WORKSPACE } from "../js/source/joints.js";

test("OpenSim definitions map all six rotary joints", () => {
  const joints = new Joints();
  const definitions = joints.openSimDefinitions();

  assert.equal(definitions.length, 6);
  assert.deepEqual(definitions.map(({ id }) => id), Array.from(joints.names));
  assert.ok(definitions.every(({ unit, map }) => unit === "rad" && typeof map.rotate === "string"));
});

test("workspace target is clamped in millimeters", () => {
  const joints = new Joints();
  const far = new Float64Array([4000, 0, 0]);
  const low = new Float64Array([100, -900, 0]);

  assert.equal(joints.limitTargetWorkspace(far), true);
  assert.ok(Math.abs(far[0] - WORKSPACE.maxRadius) < 1e-9);

  assert.equal(joints.limitTargetWorkspace(low), true);
  assert.equal(low[1], WORKSPACE.minY);
});

test("motion respects joint velocity and position limits", () => {
  const joints = new Joints();
  const current = joints.restAngles();
  const goal = joints.createState(new Float64Array(6).fill(100));
  const velocity = joints.createState();
  const next = joints.createState();
  const nextVelocity = joints.createState();

  joints.moveAnglesToGoal(current, goal, velocity, 0.05, next, nextVelocity);

  for (let index = 0; index < joints.count; index += 1) {
    assert.ok(next[index] <= joints.configs[index].max);
    assert.ok(Math.abs(nextVelocity[index]) <= joints.motion.maxVelocity * joints.configs[index].velocityScale);
  }
});

test("home state returns every joint to zero", () => {
  const joints = new Joints();
  assert.deepEqual(Array.from(joints.restAngles()), [0, 0, 0, 0, 0, 0]);
});
