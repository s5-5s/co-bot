import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import config from './config.js';
import { RobotFrame } from './math.js';

/**
 * Управляет 3D-сценой Three.js, камерой, освещением и циклом рендеринга.
 */
export default class Scene {
    /** @type {HTMLElement} */
    #container;
    /** @type {THREE.Scene} */
    scene;
    /** @type {THREE.PerspectiveCamera} */
    camera;
    /** @type {THREE.WebGLRenderer} */
    renderer;
    /** @type {OrbitControls} */
    controls;

    /** @type {number | null} */
    #rafId = null;
    /** @type {number} */
    #lastFrameTime = 0;
    /** @type {((dt: number) => void) | null} */
    #onUpdate = null;
    /** @type {THREE.Texture[]} */
    #disposableTextures = [];

    /**
     * @param {HTMLElement} container DOM-контейнер для канваса
     */
    constructor(container) {
        this.#container = container;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.scene.background);

        const { clientWidth: width, clientHeight: height } = container;
        this.camera = new THREE.PerspectiveCamera(config.scene.fov, width / height, 0.1, config.scene.gridSize * 3);
        this.camera.position.set(...config.scene.cameraPosition);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        const [targetX, targetY, targetZ] = config.scene.cameraTarget;
        const delta = this.camera.position.clone().sub(new THREE.Vector3(targetX, targetY, targetZ));
        this.controls.x = targetX;
        this.controls.y = targetY;
        this.controls.z = targetZ;
        this.controls.xMin = this.controls.yMin = -Infinity;
        this.controls.xMax = this.controls.yMax = Infinity;
        this.controls.distanceMin = 0;
        this.controls.distanceMax = Infinity;
        this.controls.angleZMin = -Math.PI / 2;
        this.controls.angleZMax = Math.PI / 2;
        this.controls.distance = delta.length();
        this.controls.angleY = Math.atan2(delta.x, -delta.z);
        this.controls.angleZ = Math.asin(delta.y / this.controls.distance);

        this.#setupLighting();
        this.#setupGridAndAxes();

        window.addEventListener('resize', this.#handleResize);
    }

    /**
     * Добавляет 3D-объект на сцену.
     * @param {THREE.Object3D} object
     */
    add(object) {
        this.scene.add(object);
    }

    /**
     * Запускает единый цикл обновления и рендеринга.
     * @param {(dt: number) => void} onUpdate
     */
    start(onUpdate) {
        this.#onUpdate = onUpdate;
        this.#lastFrameTime = performance.now();
        this.#rafId = requestAnimationFrame(this.#loop);
    }

    /**
     * Останавливает цикл и освобождает ресурсы WebGL и слушатели событий.
     */
    dispose() {
        if (this.#rafId !== null) {
            cancelAnimationFrame(this.#rafId);
            this.#rafId = null;
        }
        window.removeEventListener('resize', this.#handleResize);
        this.controls.dispose?.();
        this.#disposableTextures.forEach((tex) => tex.dispose());
        this.renderer.dispose();
    }

    #setupLighting() {
        const keyLight = new THREE.DirectionalLight(0xfff4e9, 1.5);
        keyLight.position.set(20, 32, 18);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = 90;
        keyLight.shadow.camera.left = -20;
        keyLight.shadow.camera.right = 20;
        keyLight.shadow.camera.top = 20;
        keyLight.shadow.camera.bottom = -20;
        keyLight.shadow.normalBias = 0.02;

        const fillLight = new THREE.DirectionalLight(0xb6cee9, 0.4);
        fillLight.position.set(-16, 13, -16);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5), keyLight, fillLight);
    }

    #setupGridAndAxes() {
        const { gridSize: half, gridStep: step, gridColor, axisLength, axisColors } = config.scene;
        const points = [];

        for (let coord = -half; coord <= half + 1e-6; coord += step) {
            points.push(
                RobotFrame.toWorld(new THREE.Vector3(coord, -half, 0.05)),
                RobotFrame.toWorld(new THREE.Vector3(coord, half, 0.05)),
                RobotFrame.toWorld(new THREE.Vector3(-half, coord, 0.05)),
                RobotFrame.toWorld(new THREE.Vector3(half, coord, 0.05)),
            );
        }

        const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const gridMaterial = new THREE.LineBasicMaterial({ color: gridColor });
        this.scene.add(new THREE.LineSegments(gridGeometry, gridMaterial));

        /** @type {Array<[import('./config.js').AxisName, [number, number, number]]>} */
        const axes = [
            ['x', [axisLength, 0, 0]],
            ['y', [0, axisLength, 0]],
            ['z', [0, 0, axisLength]],
        ];

        for (const [axisName, endpoint] of axes) {
            const worldEnd = RobotFrame.toWorld(new THREE.Vector3(...endpoint));
            const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), worldEnd]);
            const lineMat = new THREE.LineBasicMaterial({ color: axisColors[axisName] });
            this.scene.add(new THREE.Line(lineGeom, lineMat));

            const label = this.#createAxisLabel(axisName.toUpperCase(), axisColors[axisName]);
            label.position.copy(worldEnd).multiplyScalar(1.06);
            this.scene.add(label);
        }
    }

    /**
     * Создаёт спрайт с текстовой меткой координатной оси.
     * @param {string} text
     * @param {string} color
     * @returns {THREE.Points}
     */
    #createAxisLabel(text, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;

        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 40px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 32);

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        this.#disposableTextures.push(texture);

        return new THREE.Points(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
            new THREE.PointsMaterial({ map: texture, size: config.scene.gridStep * 0.45, transparent: true, depthTest: false })
        );
    }

    #handleResize = () => {
        const { clientWidth: width, clientHeight: height } = this.#container;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    };

    /**
     * @param {number} now
     */
    #loop = (now) => {
        this.#rafId = requestAnimationFrame(this.#loop);

        const dt = Math.min((now - this.#lastFrameTime) / 1000, config.control.maxFrameDelta);
        this.#lastFrameTime = now;

        this.#onUpdate?.(dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    };
}
