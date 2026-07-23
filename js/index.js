import Controller from "./source/controller.js";
import IK from "./source/ik.js";
import Joints from "./source/joints.js";
import RobotView from "./source/robot-view.js";
import UI from "./source/ui.js";

const initialize = async () => {
  const ui = new UI(document);
  ui.setLoading(true);

  try {
    const joints = new Joints();
    const view = await RobotView.create(document.getElementById("sim-viewport"), joints);
    const solver = new IK(joints, view);
    const controller = new Controller({ ui, view, joints, solver });
    controller.start();
  } catch (error) {
    console.error("Не удалось запустить co-bot:", error);
    ui.showFatal(error);
  }
};

initialize();
