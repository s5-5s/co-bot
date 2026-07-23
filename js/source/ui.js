const AXES = Object.freeze(["x", "y", "z"]);
const STATUS_LABELS = Object.freeze({
  loading: "Загрузка",
  ready: "Готов",
  moving: "Движение",
  reached: "Цель достигнута",
  error: "Ошибка"
});

const formatFixed = (value, digits) => Number.isFinite(value) ? value.toFixed(digits) : "—";

export default class UI {
  constructor(root = document) {
    this.root = root;
    this.form = root.getElementById("target-form");
    this.status = root.getElementById("app-status");
    this.notice = root.getElementById("app-notice");
    this.errorValue = root.getElementById("position-error");
    this.submitButton = root.getElementById("target-submit");
    this.homeButton = root.getElementById("target-home");
    this.fitButton = root.getElementById("camera-fit");
    this.inputs = AXES.map((axis) => root.getElementById(`target-${axis}`));
    this.positionValues = AXES.map((axis) => root.getElementById(`current-${axis}`));
    this.jointValues = Array.from({ length: 6 }, (_, index) => root.getElementById(`joint${index + 1}-value`));
    this.targetHandler = null;
    this.homeHandler = null;
    this.fitHandler = null;
    this.cache = new Map();

    this.handleSubmit = (event) => {
      event.preventDefault();
      const target = new Float64Array(3);
      let valid = true;

      for (let index = 0; index < this.inputs.length; index += 1) {
        const input = this.inputs[index];
        const value = input.value.trim() === "" ? NaN : Number(input.value);
        const finite = Number.isFinite(value);
        input.setAttribute("aria-invalid", String(!finite));
        if (finite) target[index] = value;
        else valid = false;
      }

      if (!valid) {
        this.setNotice("Введите конечные числовые значения для X, Y и Z.", "error");
        return;
      }

      this.targetHandler?.(target);
    };

    this.handleHome = () => this.homeHandler?.();
    this.handleFit = () => this.fitHandler?.();

    this.form.addEventListener("submit", this.handleSubmit);
    this.homeButton.addEventListener("click", this.handleHome);
    this.fitButton.addEventListener("click", this.handleFit);
  }

  onTarget(handler) {
    this.targetHandler = handler;
  }

  onHome(handler) {
    this.homeHandler = handler;
  }

  onFitCamera(handler) {
    this.fitHandler = handler;
  }

  setLoading(loading) {
    this.submitButton.disabled = loading;
    this.homeButton.disabled = loading;
    this.fitButton.disabled = loading;
    for (let index = 0; index < this.inputs.length; index += 1) this.inputs[index].disabled = loading;

    if (loading) {
      this.setStatus("loading");
      this.setNotice("Загружаем модель и готовим кинематику…", "info");
    }
  }

  setTarget(target) {
    for (let index = 0; index < this.inputs.length; index += 1) {
      this.inputs[index].value = formatFixed(target[index], 2);
      this.inputs[index].setAttribute("aria-invalid", "false");
    }
  }

  setStatus(status) {
    if (this.status.dataset.state === status) return;
    this.status.dataset.state = status;
    this.status.textContent = STATUS_LABELS[status] ?? STATUS_LABELS.ready;
  }

  setNotice(message = "", tone = "info") {
    if (this.notice.textContent !== message) this.notice.textContent = message;
    this.notice.dataset.tone = tone;
  }

  render(telemetry) {
    const { position, angles, error, status, message, tone = "info" } = telemetry;
    this.setStatus(status);
    this.setNotice(message, tone);

    for (let index = 0; index < 3; index += 1) {
      this.write(this.positionValues[index], formatFixed(position[index], 2));
    }

    for (let index = 0; index < this.jointValues.length; index += 1) {
      this.write(this.jointValues[index], formatFixed(angles[index] * 180 / Math.PI, 2));
    }

    this.write(this.errorValue, `${formatFixed(error, 2)} мм`);
  }

  showFatal(error) {
    this.setLoading(true);
    this.setStatus("error");
    this.setNotice(error instanceof Error ? error.message : String(error), "error");
  }

  destroy() {
    this.form.removeEventListener("submit", this.handleSubmit);
    this.homeButton.removeEventListener("click", this.handleHome);
    this.fitButton.removeEventListener("click", this.handleFit);
    this.targetHandler = null;
    this.homeHandler = null;
    this.fitHandler = null;
  }

  write(element, value) {
    if (this.cache.get(element) === value) return;
    this.cache.set(element, value);
    element.textContent = value;
  }
}

export { AXES, STATUS_LABELS };
