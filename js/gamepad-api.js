import config from './config.js';

export default class GamepadApi {
    gamepad = null;

    constructor(onTarget, onCamera, onReset) {
        this.onTarget = onTarget;
        this.onCamera = onCamera;
        this.onReset = onReset;
        this.targetElapsed = 0;
        this.optionsPressed = false;
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
            this.optionsPressed = false;
            this.targetElapsed = 0;
            return;
        }

        const { axes, buttons } = this.gamepad;
        if (axes.length < 4 || buttons.length < 10) return;

        const { deadzone, targetSpeed, cameraSpeed, zoomSpeed, targetInterval } = config.gamepad;
        const axis = value => Math.sign(value) *
            Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone));

        const leftX = axis(axes[0]);
        const leftY = axis(axes[1]);
        const rightX = axis(axes[2]);
        const rightY = axis(axes[3]);
        const z = axis(buttons[7].value - buttons[6].value);

        const optionsPressed = buttons[9].pressed;
        if (optionsPressed && !this.optionsPressed) this.onReset();
        this.optionsPressed = optionsPressed;

        // IK — только при ненулевом вводе и максимум ~30 раз в секунду.
        if (leftX || leftY || z) {
            this.targetElapsed += dt;
            if (this.targetElapsed >= targetInterval) {
                this.onTarget(
                    leftX * targetSpeed * this.targetElapsed,
                    -leftY * targetSpeed * this.targetElapsed,
                    z * targetSpeed * this.targetElapsed
                );
                this.targetElapsed = 0;
            }
        } else {
            this.targetElapsed = 0;
        }

        const zoom = Number(buttons[5].pressed) - Number(buttons[4].pressed);
        if (rightX || rightY || zoom) {
            this.onCamera(
                rightX * cameraSpeed * dt,
                -rightY * cameraSpeed * dt,
                zoom * zoomSpeed * dt
            );
        }
    }
}
