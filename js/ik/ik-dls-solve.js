const solve3 = (matrix, vector) => {
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let i = 0; i < 3; i++) {
    let pivot = i;

    for (let j = i + 1; j < 3; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;

    [a[i], a[pivot]] = [a[pivot], a[i]];

    if (Math.abs(a[i][i]) < 1e-9) return [0, 0, 0];

    for (let j = i + 1; j < 4; j++) a[i][j] /= a[i][i];

    a[i][i] = 1;

    for (let j = 0; j < 3; j++) {
      if (j === i) continue;

      const k = a[j][i];

      for (let n = i; n < 4; n++) a[j][n] -= k * a[i][n];
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
};

export const ikDlsSolve = ({ columns, error, damping, weightName }) => {
  const a = [[damping * damping, 0, 0], [0, damping * damping, 0], [0, 0, damping * damping]];
  const velocity = {};

  for (const column of columns) {
    const w = column.config[weightName] ?? 1;
    const v = column.vector;

    a[0][0] += w * v.x * v.x; a[0][1] += w * v.x * v.y; a[0][2] += w * v.x * v.z;
    a[1][0] += w * v.y * v.x; a[1][1] += w * v.y * v.y; a[1][2] += w * v.y * v.z;
    a[2][0] += w * v.z * v.x; a[2][1] += w * v.z * v.y; a[2][2] += w * v.z * v.z;
  }

  const y = solve3(a, [error.x, error.y, error.z]);

  for (const column of columns) {
    const w = column.config[weightName] ?? 1;
    const v = column.vector;

    velocity[column.name] = w * (v.x * y[0] + v.y * y[1] + v.z * y[2]);
  }

  return velocity;
};
