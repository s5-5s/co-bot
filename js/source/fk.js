import * as THREE from "three";

export default class FK {
    #position = new THREE.Vector3();
    #quaternion = new THREE.Quaternion();
    #joints = undefined;

    constructor(joints) {
        this.#joints = joints;
    }

    calculatePose(model) {
        if (!model) return null;

        const endEffector = model.joints[this.#joints.endEffector] ?? model.object.getObjectByName(this.#joints.endEffector);
        if (!endEffector) {
            console.warn(`${this.#joints.endEffector} не найден`);
            return null;
        }

        model.object.updateMatrixWorld(true);
        endEffector.getWorldPosition(this.#position);
        endEffector.getWorldQuaternion(this.#quaternion);

        return {
            position: this.#position.clone(),
            quaternion: this.#quaternion.clone()
        };
    }

    calculatePoint(angles, model) {
        model.setAngles(angles);

        const pose = this.calculatePose(model);
        const position = pose?.position ?? new THREE.Vector3();

        return {
            x: position.x,
            y: position.y,
            z: position.z
        };
    }
}
