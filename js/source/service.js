import FK from "./fk.js";
import IK from "./ik.js";
import Joints from "./joints.js";
import Scene from "./scene.js";
import UI from "./ui.js";

export default class Service {
    #animationFrame = undefined;
    #joints = undefined;
    #scene = undefined;
    #ui = undefined;
    #fk = undefined;
    #ik = undefined;
    #isRunning = false;
    #isStopped = false;
    
    constructor() {
        this.#joints = new Joints();
        this.#scene = new Scene(this.#joints);
        this.#ui = new UI(this.#joints);
        this.#fk = new FK(this.#joints);
        this.#ik = new IK(this.#joints);
        this.#initialize();
    }

    #initialize = async () => {
        try {
            await this.#scene.initialize({ ui: this.#ui, fk: this.#fk });
            if (this.#isStopped) return;
            this.#isRunning = true;
            this.#start();
        } catch (error) {
            console.error("Не удалось запустить UI-сервис:", error);
            this.#stop();
        }
    };

    #start = () => {
        if (!this.#isRunning) return;

        try {
            this.#scene.render(this.#ui, this.#fk, this.#ik);
        } catch (error) {
            console.error("Не удалось отрендерить сцену:", error);
        } finally {
            if (this.#isRunning) this.#animationFrame = requestAnimationFrame(this.#start);
        }
    };

    #stop() {
        this.#isStopped = true;
        this.#isRunning = false;

        if (this.#animationFrame) {
            cancelAnimationFrame(this.#animationFrame);
            this.#animationFrame = undefined;
        }
    }
}
