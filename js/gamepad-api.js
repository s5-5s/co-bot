import config from './config.js';

const applyDeadzone = (value, deadzone) => {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone) return 0;
    return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
};

export default class GamepadApi {
    gamepad = null;
    #optionsPressed = false;

    constructor(onJog, onCamera, onReset) {
        this.onJog = onJog;
        this.onCamera = onCamera;
        this.onReset = onReset;
    }

    update(dt) {
        if (!navigator.getGamepads) return;

        this.gamepad = null;
        for (const pad of navigator.getGamepads()) {
            if (pad?.connected && pad.mapping === 'standard') {
                this.gamepad = pad;
                break;
            }
        }
        if (!this.gamepad) {
            this.#optionsPressed = false;
            return;
        }

        const { axes, buttons } = this.gamepad;
        if (axes.length < 4 || buttons.length < 10) return;

        const { deadzone, cameraSpeed, zoomSpeed } = config.gamepad;
        const leftX = applyDeadzone(axes[0], deadzone);
        const leftY = applyDeadzone(axes[1], deadzone);
        const rightX = applyDeadzone(axes[2], deadzone);
        const rightY = applyDeadzone(axes[3], deadzone);
        const z = applyDeadzone(buttons[7].value - buttons[6].value, deadzone);

        if (leftX || leftY || z) {
            this.onJog(leftX, -leftY, z, dt);
        }

        const zoom = Number(buttons[5].pressed) - Number(buttons[4].pressed);
        if (rightX || rightY || zoom) {
            this.onCamera(
                rightX * cameraSpeed * dt,
                -rightY * cameraSpeed * dt,
                zoom * zoomSpeed * dt,
            );
        }

        const optionsPressed = buttons[9].pressed;
        if (optionsPressed && !this.#optionsPressed) {
            this.onReset();
        }
        this.#optionsPressed = optionsPressed;
    }
}
