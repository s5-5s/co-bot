const EPSILON = 1e-12;

const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const copy3 = (out, source) => {
  out[0] = source[0];
  out[1] = source[1];
  out[2] = source[2];
  return out;
};

const copy4 = (out, source) => {
  out[0] = source[0];
  out[1] = source[1];
  out[2] = source[2];
  out[3] = source[3];
  return out;
};

const limit3 = (vector, limit) => {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= limit || length < EPSILON) return vector;

  const scale = limit / length;
  vector[0] *= scale;
  vector[1] *= scale;
  vector[2] *= scale;
  return vector;
};

const rotateByQuaternion = (out, x, y, z, quaternion, offset = 0) => {
  const qx = quaternion[offset];
  const qy = quaternion[offset + 1];
  const qz = quaternion[offset + 2];
  const qw = quaternion[offset + 3];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  const length = Math.hypot(out[0], out[1], out[2]);
  if (length > EPSILON) {
    out[0] /= length;
    out[1] /= length;
    out[2] /= length;
  }

  return out;
};

const rotationErrorVector = (out, current, target) => {
  const cx = -current[0];
  const cy = -current[1];
  const cz = -current[2];
  const cw = current[3];
  const tx = target[0];
  const ty = target[1];
  const tz = target[2];
  const tw = target[3];
  let qx = tw * cx + tx * cw + ty * cz - tz * cy;
  let qy = tw * cy - tx * cz + ty * cw + tz * cx;
  let qz = tw * cz + tx * cy - ty * cx + tz * cw;
  let qw = tw * cw - tx * cx - ty * cy - tz * cz;
  const quaternionLength = Math.hypot(qx, qy, qz, qw) || 1;

  qx /= quaternionLength;
  qy /= quaternionLength;
  qz /= quaternionLength;
  qw /= quaternionLength;

  if (qw < 0) {
    qx = -qx;
    qy = -qy;
    qz = -qz;
    qw = -qw;
  }

  const vectorLength = Math.hypot(qx, qy, qz);
  if (vectorLength < 1e-9) {
    out[0] = qx * 2;
    out[1] = qy * 2;
    out[2] = qz * 2;
    return out;
  }

  const scale = (2 * Math.atan2(vectorLength, qw)) / vectorLength;
  out[0] = qx * scale;
  out[1] = qy * scale;
  out[2] = qz * scale;
  return out;
};

const solveSymmetric3 = (matrix, vector, out) => {
  const a00 = matrix[0];
  const a01 = matrix[1];
  const a02 = matrix[2];
  const a11 = matrix[4];
  const a12 = matrix[5];
  const a22 = matrix[8];
  const c00 = a11 * a22 - a12 * a12;
  const c01 = a02 * a12 - a01 * a22;
  const c02 = a01 * a12 - a02 * a11;
  const c11 = a00 * a22 - a02 * a02;
  const c12 = a01 * a02 - a00 * a12;
  const c22 = a00 * a11 - a01 * a01;
  const determinant = a00 * c00 + a01 * c01 + a02 * c02;

  if (Math.abs(determinant) < EPSILON) {
    out.fill(0);
    return out;
  }

  const inverse = 1 / determinant;
  out[0] = (c00 * vector[0] + c01 * vector[1] + c02 * vector[2]) * inverse;
  out[1] = (c01 * vector[0] + c11 * vector[1] + c12 * vector[2]) * inverse;
  out[2] = (c02 * vector[0] + c12 * vector[1] + c22 * vector[2]) * inverse;
  return out;
};

export {
  copy3,
  copy4,
  distance3,
  limit3,
  rotateByQuaternion,
  rotationErrorVector,
  solveSymmetric3
};
