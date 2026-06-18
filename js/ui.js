const fieldChange = (state, axis) => (event) => {
  const value = Number(event.target.value);
  if (Number.isFinite(value)) state.targetDraft[axis] = value;
};

const applyTarget = (state) => () => {
  state.controlMode = "target";
  state.target.set(state.targetDraft.x, state.targetDraft.y, state.targetDraft.z);
  if (state.fkPose?.quaternion) state.targetQuaternion.copy(state.fkPose.quaternion);
};

const resetTarget = (state, ui) => () => {
  state.controlMode = "home";
  state.target.copy(state.targetStart);
  state.targetQuaternion.copy(state.targetQuaternionStart);
  state.targetDraft = { x: state.target.x, y: state.target.y, z: state.target.z };
  ui.x.value = state.target.x.toFixed(3);
  ui.y.value = state.target.y.toFixed(3);
  ui.z.value = state.target.z.toFixed(3);
};

export const createUi = ({ state }) => {
  const ui = {
    currentX: document.getElementById("current-x"),
    currentY: document.getElementById("current-y"),
    currentZ: document.getElementById("current-z"),
    joints: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`joint${i}`, document.getElementById(`joint${i}-value`)])),
    x: document.getElementById("target-x"),
    y: document.getElementById("target-y"),
    z: document.getElementById("target-z"),
    ok: document.getElementById("target-ok"),
    reset: document.getElementById("target-reset")
  };

  for (const axis of ["x", "y", "z"]) {
    ui[axis].value = state.target[axis].toFixed(3);
    ui[axis].onchange = fieldChange(state, axis);
  }

  ui.ok.onclick = applyTarget(state);
  ui.reset.onclick = resetTarget(state, ui);
  return ui;
};
