import * as THREE from "three";

export default class Model {
    #ghostMode = false;
    #object = undefined;

    #joint1 = undefined;
    #joint2 = undefined;
    #joint3 = undefined;
    #joint4 = undefined;
    #joint5 = undefined;
    #joint6 = undefined;

    #joint1InitialQuaternion = undefined;
    #joint2InitialQuaternion = undefined;
    #joint3InitialQuaternion = undefined;
    #joint4InitialQuaternion = undefined;
    #joint5InitialQuaternion = undefined;
    #joint6InitialQuaternion = undefined;

    constructor({ object={}, ghostMode = false } = {}) {
        this.#object = object;
        this.#ghostMode = ghostMode;
        this.#initialize();
    }

    get object() {
        return this.#object;
    }

    #initialize = () => {
        this.#object.position.set(0, 0, 0);
        this.#object.scale.set(15, 15, 15);
        this.#applyMaterials();
        this.#initializeJoints();
        this.setAngles();
        if (this.#ghostMode) this.#object.visible = false;
    };

    setAngles = ({ joint1 = 0, joint2 = 0, joint3 = 0, joint4 = 0, joint5 = 0, joint6 = 0 } = {}) => {
        this.#setJointAngle(this.#joint1, this.#joint1InitialQuaternion, new THREE.Vector3(1, 0, 0), joint1);
        this.#setJointAngle(this.#joint2, this.#joint2InitialQuaternion, new THREE.Vector3(1, 0, 0), joint2);
        this.#setJointAngle(this.#joint3, this.#joint3InitialQuaternion, new THREE.Vector3(1, 0, 0), joint3);
        this.#setJointAngle(this.#joint4, this.#joint4InitialQuaternion, new THREE.Vector3(0, 0, 1), joint4);
        this.#setJointAngle(this.#joint5, this.#joint5InitialQuaternion, new THREE.Vector3(0, 0, 1), joint5);
        this.#setJointAngle(this.#joint6, this.#joint6InitialQuaternion, new THREE.Vector3(1, 0, 0), joint6);
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

    #initializeJoints = () => {
        this.#joint1 = this.#findJoint("joint1");
        this.#joint2 = this.#findJoint("joint2");
        this.#joint3 = this.#findJoint("joint3");
        this.#joint4 = this.#findJoint("joint4");
        this.#joint5 = this.#findJoint("joint5");
        this.#joint6 = this.#findJoint("joint6");

        this.#joint1InitialQuaternion = this.#joint1?.quaternion.clone();
        this.#joint2InitialQuaternion = this.#joint2?.quaternion.clone();
        this.#joint3InitialQuaternion = this.#joint3?.quaternion.clone();
        this.#joint4InitialQuaternion = this.#joint4?.quaternion.clone();
        this.#joint5InitialQuaternion = this.#joint5?.quaternion.clone();
        this.#joint6InitialQuaternion = this.#joint6?.quaternion.clone();
    };

    #findJoint = (name) => {
        const joint = this.#object.getObjectByName(name);
        if (!joint) console.warn(`${name} не найден`);
        return joint;
    };

    #setJointAngle = (joint, initialQuaternion, axis, angle) => {
        if (!joint || !initialQuaternion) return;
        const rotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        joint.quaternion.copy(initialQuaternion).multiply(rotation);
    };
}
