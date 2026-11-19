import * as THREE from 'three';
import config from './config.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * @typedef {Object} UICallbacks
 * @property {(x: number, y: number, z: number) => THREE.Vector3} onMove
 * @property {() => void} onReset
 */

export default class UI {
    /** @type {Record<'x' | 'y' | 'z', HTMLInputElement>} */
    #targetInputs;
    /** @type {Record<'x' | 'y' | 'z', HTMLElement>} */
    #currentOutputs;
    /** @type {HTMLElement[]} */
    #jointValueElements = [];
    /** @type {HTMLButtonElement} */
    #resetBtn;
    /** @type {UICallbacks} */
    #callbacks;

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

        this.#currentOutputs = {
            x: /** @type {HTMLElement} */ (document.getElementById('current-x')),
            y: /** @type {HTMLElement} */ (document.getElementById('current-y')),
            z: /** @type {HTMLElement} */ (document.getElementById('current-z')),
        };

        this.#resetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('target-reset'));

        for (const [axis, input] of Object.entries(this.#targetInputs)) {
            input.min = String(axis === 'z' ? config.workspace.minZ : -config.workspace.maxRadius);
            input.max = String(axis === 'z' ? config.workspace.maxZ : config.workspace.maxRadius);
            input.step = String(config.ik.tolerance);
        }

        this.#buildJointReadouts();
        this.#bindEvents();
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
     * Обновляет ползунки и отображаемые целевые координаты.
     * @param {THREE.Vector3} position
     */
    setTargetPosition(position) {
        for (const [axis, input] of Object.entries(this.#targetInputs)) {
            const value = position[axis].toFixed(3);
            input.value = value;
            input.previousElementSibling.querySelector('output').textContent = value;
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
     * Считывает заданные ползунками целевые координаты.
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
        this.#resetBtn.addEventListener('click', this.#handleReset);

        for (const input of Object.values(this.#targetInputs)) {
            input.addEventListener('input', this.#handleConfirm);
        }
    }

    #handleConfirm = () => {
        const target = this.readTargetPosition();
        if (!target) return;

        const clampedTarget = this.#callbacks.onMove(target.x, target.y, target.z);
        this.setTargetPosition(clampedTarget);
    };

    #handleReset = () => {
        this.#callbacks.onReset();
    };

}
