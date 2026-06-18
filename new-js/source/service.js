import Scene from "./scene.js";

export default class Service {
    #renderDelayMs = 16.6;
    #scene = undefined;
    #renderLoopTimer = undefined;
    #isRunning = false;
    #isStopped = false;
    
    constructor() {
        this.#initialize();
    }

    #initialize = async () => {
        const scene = new Scene();
        this.#scene = scene;

        try {
            await scene.initialize();
            if (this.#isStopped || this.#scene !== scene) return;

            this.#isRunning = true;
            this.#start();
        } catch (error) {
            console.error("Не удалось запустить UI-сервис:", error);
            this.stop();
        }
    };

    #start = () => {
        if (!this.#isRunning) return;

        try {
            this.#scene.render();
        } catch (error) {
            console.error("Не удалось отрендерить сцену:", error);
        } finally {
            if (this.#isRunning) this.#renderLoopTimer = setTimeout(this.#start, this.#renderDelayMs);
        }
    };

    stop() {
        this.#isStopped = true;
        this.#isRunning = false;

        if (this.#renderLoopTimer) {
            clearTimeout(this.#renderLoopTimer);
            this.#renderLoopTimer = undefined;
        }
    }
}
