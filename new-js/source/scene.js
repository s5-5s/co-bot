import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Model from "./model.js";


export default class Scene {
    #scene = undefined;
    #camera = undefined;
    #renderer = undefined;
    #controls = undefined;
    #model = undefined;
    #ghostModel = undefined;

    initialize = async () => {
        this.#renderer = new THREE.WebGLRenderer({ antialias: true });
        this.#renderer.setSize(window.innerWidth, window.innerHeight);
        this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.#renderer.setClearColor(0x000000);
        this.#renderer.shadowMap.enabled = true;
        this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.#renderer.toneMappingExposure = 1.25;
        document.body.appendChild(this.#renderer.domElement);

        this.#scene = new THREE.Scene();
        this.#camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.#camera.position.set(15, 40, 15);
        this.#camera.lookAt(0, 0, 0);

        this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
        this.#controls.enableDamping = true;

        this.#scene.add(new THREE.AmbientLight(0xffffff, 1.5));

        const light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(25, 40, 20);
        light.castShadow = true;

        this.#scene.add(light, this.#createGrid());
        this.#scene.add(
            this.#createAxis({ direction: new THREE.Vector3(1, 0, 0), color: 0xcc5555, labelText: "X", labelPosition: new THREE.Vector3(23, 0, 0), length: 20 }),
            this.#createAxis({ direction: new THREE.Vector3(0, 1, 0), color: 0x55cc66, labelText: "Y", labelPosition: new THREE.Vector3(0, 23, 0), length: 20 }),
            this.#createAxis({ direction: new THREE.Vector3(0, 0, 1), color: 0x5588cc, labelText: "Z", labelPosition: new THREE.Vector3(0, 0, 23), length: 20 })
        );

        const gltf = await this.#loadGLTF();

        this.#model = new Model({ object: gltf });
        this.#scene.add(this.#model.object);

        this.#ghostModel = new Model({ object: gltf.clone(true), ghostMode: true });
        this.#scene.add(this.#ghostModel.object);

        window.addEventListener("resize", () => {
            this.#camera.aspect = window.innerWidth / window.innerHeight;
            this.#camera.updateProjectionMatrix();
            this.#renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };

    render = () => {
        this.#controls?.update();
        this.#renderer?.render(this.#scene, this.#camera);
    };

    #loadGLTF = async () => {
        try {
            return (await new GLTFLoader().loadAsync("../models/co-bot.gltf")).scene;
        } catch (error) {
            console.error("Ошибка загрузки модели:", error);
            throw error;
        }
    };

    #createGrid = () => {
        const grid = new THREE.GridHelper(200, 40, 0xcc5555, 0xcc5555);
        grid.material.transparent = true;
        grid.material.opacity = 0.55;
        return grid;
    };

    #createAxisLabel = (text, color, position) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = 128;
        canvas.height = 128;
        ctx.fillStyle = color;
        ctx.font = "bold 56px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 64, 64);

        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        sprite.position.copy(position);
        sprite.scale.set(5, 5, 1);
        return sprite;
    };

    #createAxis = ({ direction, color, labelText, labelPosition, length = 25 }) => {
        const axis = new THREE.Group();
        const dir = direction.clone().normalize();
        const material = new THREE.MeshBasicMaterial({ color });
        const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, length, 16), material);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2, 24), material);

        cylinder.position.copy(dir.clone().multiplyScalar(length / 2));
        cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cone.position.copy(dir.clone().multiplyScalar(length + 1));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        axis.add(cylinder, cone, this.#createAxisLabel(labelText, `#${color.toString(16).padStart(6, "0")}`, labelPosition));
        return axis;
    };

}
