import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import config from './config.js';
import { clamp } from './math.js';
import Scene from './scene.js';
import Robot from './robot.js';
import RobotController from './controller.js';
import GamepadApi from './gamepad-api.js';
import UI from './ui.js';

/**
 * @param {string} path
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>}
 */
function loadModel(path) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(path, resolve, undefined, reject);
    });
}

async function bootstrap() {
    const viewport = /** @type {HTMLElement | null} */ (document.querySelector('.model-view'));
    if (!viewport) {
        throw new Error('Контейнер .model-view не найден в DOM');
    }

    const scene = new Scene(viewport);
    const gltf = await loadModel(config.model.path);

    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const robot = new Robot(gltf.scene);
    const controller = new RobotController(robot);
    scene.add(robot.object);
    scene.add(controller.ghost.object);

    const tcpPositionBuffer = new THREE.Vector3();
    const initialTcpPos = controller.getCurrentTcpRobotPosition(tcpPositionBuffer).clone();
    const targetPosition = initialTcpPos.clone();

    let ui;

    const resetRobot = () => {
        controller.goHome();
        targetPosition.copy(initialTcpPos);
        ui.setTargetPosition(targetPosition);
    };

    const jogRobot = (x, y, z, dt) => {
        if (ui.mode === 'target') return;

        const distance = config.control.jogSpeed * dt;
        const position = controller.jog(
            x * distance,
            y * distance,
            z * distance,
            ui.mode,
        );

        targetPosition.copy(position);
        ui.setTargetPosition(targetPosition);
    };

    ui = new UI({
        onJog: jogRobot,
        onMove: (x, y, z) => {
            const position = controller.moveToRobotPosition(x, y, z);
            targetPosition.copy(position);
            return position;
        },
        onReset: resetRobot,
    });

    const gamepad = new GamepadApi(
        jogRobot,
        (yaw, pitch, zoom) => {
            const controls = scene.controls;
            controls.angleY += yaw;
            controls.angleZ = clamp(controls.angleZ + pitch, controls.angleZMin, controls.angleZMax);
            controls.distance = clamp(
                controls.distance - zoom,
                Math.max(controls.distanceMin, scene.camera.near),
                controls.distanceMax,
            );
        },
        resetRobot,
    );

    ui.setTargetPosition(initialTcpPos);
    ui.updateTelemetry(initialTcpPos, robot.angles);

    scene.start((dt) => {
        ui.update(dt);
        gamepad.update(dt);
        controller.update(dt);
        controller.getCurrentTcpRobotPosition(tcpPositionBuffer);
        ui.updateTelemetry(tcpPositionBuffer, robot.angles);
    });
}

bootstrap().catch((error) => {
    console.error('Ошибка инициализации симулятора:', error);
});
