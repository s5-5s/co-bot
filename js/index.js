import { CONFIG, JOINTS_CONFIG } from "./config.js";
import { createScene } from "./scene.js";
import { createState } from "./state.js";
import { createUi } from "./ui.js";
import { ikLoop } from "./ik-loop.js";
import { fkLoop } from "./fk-loop.js";
import { renderLoop } from "./render-loop.js";

const setup = await createScene({ config: CONFIG, jointsConfig: JOINTS_CONFIG });

if (setup) {
  const state = createState({ setup, jointsConfig: JOINTS_CONFIG });
  const ui = createUi({ state });

  ikLoop({ setup, jointsConfig: JOINTS_CONFIG, config: CONFIG, state, frequency: CONFIG.frequency.ik });
  fkLoop({ setup, jointsConfig: JOINTS_CONFIG, config: CONFIG, state, frequency: CONFIG.frequency.fk });
  renderLoop({ setup, state, ui, frequency: CONFIG.frequency.render });
}
