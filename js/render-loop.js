import { TO_DEG } from "./config.js";

export const renderLoop = ({ setup, state, ui, frequency }) => {
  let previousRenderTime = 0;
  const interval = 1000 / frequency;

  const renderData = () => {
    const position = state.fkPose?.position ?? state.target;
    ui.currentX.textContent = position.x.toFixed(3);
    ui.currentY.textContent = position.y.toFixed(3);
    ui.currentZ.textContent = position.z.toFixed(3);

    for (const name in ui.joints) {
      ui.joints[name].textContent = ((state.qActual[name] ?? 0) * TO_DEG).toFixed(2);
    }
  };

  const render = (time) => {
    requestAnimationFrame(render);
    if (time - previousRenderTime < interval) return;
    previousRenderTime = time;

    setup.targetMarker.position.copy(state.target);
    setup.targetMarker.quaternion.copy(state.targetQuaternion);
    renderData();
    setup.controls.update();
    setup.renderer.render(setup.scene, setup.camera);
  };

  requestAnimationFrame(render);
};
