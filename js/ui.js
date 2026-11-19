import * as THREE from 'three';
import config from './config.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * @typedef {Object} UICallbacks
 * @property {(x: number, y: number, z: number, dt: number) => void} onJog
 * @property {(x: number, y: number, z: number) => THREE.Vector3} onMove
 * @property {() => void} onReset
 */

export default class UI {
    /** @type {'base' | 'tool' | 'target'} */
    mode = 'base';

    /** @type {Record<'x' | 'y' | 'z', HTMLInputElement>} */
    #targetInputs;
    /** @type {Record<'x' | 'y' | 'z', HTMLOutputElement>} */
    #targetOutputs;
    /** @type {Record<'x' | 'y' | 'z', HTMLElement>} */
    #currentOutputs;
    /** @type {HTMLElement[]} */
    #jointValueElements = [];
    /** @type {HTMLButtonElement} */
    #resetBtn;
    /** @type {HTMLButtonElement} */
    #okBtn;
    /** @type {HTMLButtonElement[]} */
    #modeButtons;
    /** @type {HTMLElement} */
    #jogPanel;
    /** @type {HTMLElement} */
    #targetPanel;
    /** @type {HTMLElement} */
    #joystick;
    /** @type {HTMLElement} */
    #joystickThumb;
    /** @type {HTMLInputElement} */
    #zInput;
    /** @type {HTMLOutputElement} */
    #zOutput;
    /** @type {UICallbacks} */
    #callbacks;

    #jogX = 0;
    #jogY = 0;
    #jogZ = 0;
    #joystickPointerId = null;

    /**
     * @param {UICallbacks} callbacks Обработчики команд пользователя
     */
    constructor(callbacks) {
        this.#callbacks = callbacks;

        this.#targetInputs = {
            x: /** @type {HTMLInputElement} */ (document.getElementById('target-x')),
            y: /** @type {HTMLInputElement} */ (document.getElementById('target-y')),
            z: /** @type {HTMLInputElement} */ (document.getElementById('target-z')),
        };

        this.#targetOutputs = {
            x: /** @type {HTMLOutputElement} */ (document.getElementById('target-value-x')),
            y: /** @type {HTMLOutputElement} */ (document.getElementById('target-value-y')),
            z: /** @type {HTMLOutputElement} */ (document.getElementById('target-value-z')),
        };

        this.#currentOutputs = {
            x: /** @type {HTMLElement} */ (document.getElementById('current-x')),
            y: /** @type {HTMLElement} */ (document.getElementById('current-y')),
            z: /** @type {HTMLElement} */ (document.getElementById('current-z')),
        };

        this.#resetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('target-reset'));
        this.#okBtn = /** @type {HTMLButtonElement} */ (document.getElementById('target-ok'));
        this.#modeButtons = Array.from(document.querySelectorAll('.tcp-mode'));
        this.#jogPanel = /** @type {HTMLElement} */ (document.getElementById('tcp-jog'));
        this.#targetPanel = /** @type {HTMLElement} */ (document.getElementById('tcp-target'));
        this.#joystick = /** @type {HTMLElement} */ (document.getElementById('tcp-xy'));
        this.#joystickThumb = /** @type {HTMLElement} */ (this.#joystick.querySelector('.tcp-xy-thumb'));
        this.#zInput = /** @type {HTMLInputElement} */ (document.getElementById('tcp-z'));
        this.#zOutput = /** @type {HTMLOutputElement} */ (document.getElementById('tcp-z-value'));

        this.#buildJointReadouts();
        this.#bindEvents();
    }

    update(dt) {
        if (this.mode === 'target') return;
        if (this.#jogX || this.#jogY || this.#jogZ) {
            this.#callbacks.onJog(this.#jogX, this.#jogY, this.#jogZ, dt);
        }
    }

    /**
     * Создаёт строки отображения углов для каждого сустава внутри #joint-values.
     */
    #buildJointReadouts() {
        const container = document.getElementById('joint-values');
        if (!container) return;

        container.innerHTML = '';
        this.#jointValueElements = config.joints.map((joint) => {
            const row = document.createElement('div');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'data-name';
            nameSpan.textContent = `${joint.name}: `;

            const valueSpan = document.createElement('span');
            valueSpan.className = 'data-value';
            valueSpan.textContent = '0.0°';

            row.append(nameSpan, valueSpan);
            container.appendChild(row);
            return valueSpan;
        });
    }

    /**
     * Обновляет отображаемую целевую позицию и поля TCP TARGET.
     * @param {THREE.Vector3} position
     */
    setTargetPosition(position) {
        for (const axis of /** @type {const} */ (['x', 'y', 'z'])) {
            const value = position[axis].toFixed(3);
            this.#targetOutputs[axis].textContent = value;
            this.#targetInputs[axis].value = value;
        }
    }

    /**
     * Обновляет панель телеметрии: текущие координаты TCP и углы суставов в градусах.
     * @param {THREE.Vector3} tcpPosition Позиция TCP в системе координат робота
     * @param {ArrayLike<number>} jointAngles Углы суставов в радианах
     */
    updateTelemetry(tcpPosition, jointAngles) {
        this.#currentOutputs.x.textContent = tcpPosition.x.toFixed(3);
        this.#currentOutputs.y.textContent = tcpPosition.y.toFixed(3);
        this.#currentOutputs.z.textContent = tcpPosition.z.toFixed(3);

        for (let i = 0; i < this.#jointValueElements.length; i++) {
            const deg = jointAngles[i] * RAD_TO_DEG;
            this.#jointValueElements[i].textContent = `${deg.toFixed(1)}°`;
        }
    }

    /**
     * Считывает абсолютную цель из режима TCP TARGET.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    readTargetPosition() {
        const x = Number.parseFloat(this.#targetInputs.x.value.replace(',', '.'));
        const y = Number.parseFloat(this.#targetInputs.y.value.replace(',', '.'));
        const z = Number.parseFloat(this.#targetInputs.z.value.replace(',', '.'));

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return null;
        }
        return { x, y, z };
    }

    #bindEvents() {
        this.#resetBtn.addEventListener('click', this.#callbacks.onReset);
        this.#okBtn.addEventListener('click', this.#handleConfirm);

        for (const button of this.#modeButtons) {
            button.addEventListener('click', this.#handleModeChange);
        }

        this.#joystick.addEventListener('pointerdown', this.#handleJoystickDown);
        this.#joystick.addEventListener('pointermove', this.#handleJoystickMove);
        this.#joystick.addEventListener('pointerup', this.#handleJoystickUp);
        this.#joystick.addEventListener('pointercancel', this.#handleJoystickUp);

        this.#zInput.addEventListener('input', this.#handleZInput);
        this.#zInput.addEventListener('pointerup', this.#resetZ);
        this.#zInput.addEventListener('pointercancel', this.#resetZ);
        this.#zInput.addEventListener('keyup', this.#resetZ);
        this.#zInput.addEventListener('blur', this.#resetZ);
    }

    #handleModeChange = (event) => {
        const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
        const mode = button.dataset.mode;
        if (mode !== 'base' && mode !== 'tool' && mode !== 'target') return;

        this.mode = mode;
        for (const item of this.#modeButtons) {
            item.classList.toggle('is-active', item === button);
        }

        this.#jogPanel.hidden = mode === 'target';
        this.#targetPanel.hidden = mode !== 'target';
        this.#resetJoystick();
        this.#resetZ();
    };

    #handleJoystickDown = (event) => {
        if (event.button !== 0) return;
        this.#joystickPointerId = event.pointerId;
        this.#joystick.setPointerCapture(event.pointerId);
        this.#setJoystickFromPointer(event);
    };

    #handleJoystickMove = (event) => {
        if (event.pointerId !== this.#joystickPointerId) return;
        this.#setJoystickFromPointer(event);
    };

    #handleJoystickUp = (event) => {
        if (event.pointerId !== this.#joystickPointerId) return;
        this.#joystickPointerId = null;
        this.#resetJoystick();
    };

    #setJoystickFromPointer(event) {
        const rect = this.#joystick.getBoundingClientRect();
        const radius = Math.min(rect.width, rect.height) / 2;
        let x = (event.clientX - (rect.left + rect.width / 2)) / radius;
        let y = -((event.clientY - (rect.top + rect.height / 2)) / radius);
        const length = Math.hypot(x, y);

        if (length > 1) {
            x /= length;
            y /= length;
        }

        this.#jogX = x;
        this.#jogY = y;
        this.#joystickThumb.style.left = `${50 + x * 50}%`;
        this.#joystickThumb.style.top = `${50 - y * 50}%`;
    }

    #resetJoystick() {
        this.#jogX = 0;
        this.#jogY = 0;
        this.#joystickThumb.style.left = '50%';
        this.#joystickThumb.style.top = '50%';
    }

    #handleZInput = () => {
        this.#jogZ = Number(this.#zInput.value);
        this.#zOutput.textContent = this.#jogZ.toFixed(2);
    };

    #resetZ = () => {
        this.#jogZ = 0;
        this.#zInput.value = '0';
        this.#zOutput.textContent = '0.00';
    };

    #handleConfirm = () => {
        const target = this.readTargetPosition();
        if (!target) return;

        const acceptedTarget = this.#callbacks.onMove(target.x, target.y, target.z);
        this.setTargetPosition(acceptedTarget);
    };
}
