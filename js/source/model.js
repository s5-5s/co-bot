import * as THREE from "three";

export default class Model {
    #ghostMode = false;
    #object = undefined;
    #joints = undefined;
    #modelJoints = undefined;
    #angles = undefined;

    constructor({ object = new THREE.Group(), joints, ghostMode = false } = {}) {
        this.#object = object;
        this.#joints = joints;
        this.#ghostMode = ghostMode;
        this.#initialize();
    }

    get object() {
        return this.#object;
    }

    get joints() {
        return this.#modelJoints.joints;
    }

    get axes() {
        return this.#modelJoints.axes;
    }

    get initialQuaternions() {
        return this.#modelJoints.initialQuaternions;
    }

    get angles() {
        return this.#joints.cloneAngles(this.#angles);
    }

    #initialize = () => {
        this.#object.position.set(0, 0, 0);
        this.#object.scale.set(15, 15, 15);
        this.#applyMaterials();
        this.#modelJoints = this.#joints.createModelJoints(this.#object);
        this.setAngles();
        if (this.#ghostMode) this.#object.visible = false;
    };

    setAngles = (angles) => {
        this.#angles = this.#joints.cloneAngles(angles);
        this.#joints.setAngles({ ...this.#modelJoints, angles: this.#angles });
    };

    #applyMaterials = () => {
        const ghostMaterial = new THREE.MeshBasicMaterial({
            color: 0xcc5555,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });

        this.#object.traverse((object) => {
            if (!object.isMesh || !object.material) return;

            object.castShadow = !this.#ghostMode;
            object.receiveShadow = !this.#ghostMode;

            if (this.#ghostMode) {
                object.material = ghostMaterial;
                return;
            }

            object.material = object.material.clone();
            object.material.roughness = 0.45;
            object.material.metalness = 0.15;
            object.material.envMapIntensity = 1;
            object.material.needsUpdate = true;
        });
    };
}
