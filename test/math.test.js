import test from "node:test";
import assert from "node:assert/strict";
import {
  distance3,
  limit3,
  rotateByQuaternion,
  rotationErrorVector,
  solveSymmetric3
} from "../js/source/math.js";

test("distance3 and limit3 operate in-place", () => {
  assert.equal(distance3(new Float64Array([0, 0, 0]), new Float64Array([3, 4, 0])), 5);

  const vector = new Float64Array([6, 8, 0]);
  assert.equal(limit3(vector, 5), vector);
  assert.deepEqual(Array.from(vector), [3, 4, 0]);
});

test("rotateByQuaternion rotates a direction", () => {
  const half = Math.sqrt(0.5);
  const out = new Float64Array(3);
  rotateByQuaternion(out, 1, 0, 0, new Float64Array([0, 0, half, half]));

  assert.ok(Math.abs(out[0]) < 1e-12);
  assert.ok(Math.abs(out[1] - 1) < 1e-12);
  assert.ok(Math.abs(out[2]) < 1e-12);
});

test("rotationErrorVector is zero for equal quaternions", () => {
  const out = new Float64Array(3);
  const identity = new Float64Array([0, 0, 0, 1]);
  rotationErrorVector(out, identity, identity);
  assert.deepEqual(Array.from(out), [0, 0, 0]);
});

test("solveSymmetric3 solves a positive definite system", () => {
  const matrix = new Float64Array([
    4, 1, 0,
    1, 3, 0,
    0, 0, 2
  ]);
  const out = new Float64Array(3);
  solveSymmetric3(matrix, new Float64Array([1, 2, 4]), out);

  assert.ok(Math.abs(out[0] - 1 / 11) < 1e-12);
  assert.ok(Math.abs(out[1] - 7 / 11) < 1e-12);
  assert.ok(Math.abs(out[2] - 2) < 1e-12);
});
