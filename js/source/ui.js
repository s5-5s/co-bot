export default class UI {
    #joints = undefined;
    #command = undefined;
    #targetDraft = { x: 0, y: 0, z: 0 };

    #current = {};
    #jointElements = {};
    #targetInputs = {};
    #targetOk = undefined;
    #targetReset = undefined;

    constructor(joints) {
        this.#joints = joints;
        this.#current = Object.fromEntries(["x", "y", "z"].map((axis) => [axis, document.getElementById(`current-${axis}`)]));
        this.#jointElements = Object.fromEntries(this.#joints.names.map((name) => [name, document.getElementById(`${name}-value`)]));
        this.#targetInputs = Object.fromEntries(["x", "y", "z"].map((axis) => [axis, document.getElementById(`target-${axis}`)]));
        this.#targetOk = document.getElementById("target-ok");
        this.#targetReset = document.getElementById("target-reset");

        for (const axis of ["x", "y", "z"]) this.#targetInputs[axis].onchange = this.#targetChange(axis);

        this.#targetOk.onclick = this.#targetOkClick;
        this.#targetReset.onclick = this.#targetResetClick;
    }

    consumeCommand = () => {
        const command = this.#command;
        this.#command = undefined;
        return command;
    };

    setTarget = (point) => {
        for (const axis of ["x", "y", "z"]) {
            const value = point?.[axis] ?? 0;

            this.#targetDraft[axis] = value;
            this.#targetInputs[axis].value = value.toFixed(3);
        }
    };

    setPoint(point) {
        for (const axis of ["x", "y", "z"]) this.#current[axis].textContent = (point?.[axis] ?? 0).toFixed(3);
    }

    setAngles(angles) {
        for (const name of this.#joints.names) this.#jointElements[name].textContent = ((angles[name] ?? 0) * this.#joints.toDeg).toFixed(2);
    }

    #targetChange = (axis) => (event) => {
        const value = Number(event.target.value);
        if (Number.isFinite(value)) this.#targetDraft[axis] = value;
    };

    #targetOkClick = () => {
        for (const axis of ["x", "y", "z"]) this.#targetChange(axis)({ target: this.#targetInputs[axis] });

        this.#command = { mode: "target", target: { ...this.#targetDraft } };
    };

    #targetResetClick = () => {
        this.#command = { mode: "home" };
    };
}
