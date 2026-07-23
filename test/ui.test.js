import test from "node:test";
import assert from "node:assert/strict";
import UI from "../js/source/ui.js";

class FakeElement {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }
}

class FakeDocument {
  constructor() {
    const ids = [
      "target-form", "app-status", "app-notice", "position-error",
      "target-submit", "target-home", "camera-fit",
      "target-x", "target-y", "target-z",
      "current-x", "current-y", "current-z",
      "joint1-value", "joint2-value", "joint3-value",
      "joint4-value", "joint5-value", "joint6-value"
    ];
    this.elements = new Map(ids.map((id) => [id, new FakeElement()]));
  }

  getElementById(id) {
    return this.elements.get(id);
  }
}

test("UI submits a finite XYZ target", () => {
  const document = new FakeDocument();
  const ui = new UI(document);
  let received;
  ui.onTarget((target) => {
    received = Array.from(target);
  });

  document.getElementById("target-x").value = "120.5";
  document.getElementById("target-y").value = "-20";
  document.getElementById("target-z").value = "42";
  document.getElementById("target-form").dispatch("submit");

  assert.deepEqual(received, [120.5, -20, 42]);
});

test("UI rejects empty and non-finite target fields", () => {
  const document = new FakeDocument();
  const ui = new UI(document);
  let calls = 0;
  ui.onTarget(() => {
    calls += 1;
  });

  document.getElementById("target-x").value = "";
  document.getElementById("target-y").value = "nope";
  document.getElementById("target-z").value = "1";
  document.getElementById("target-form").dispatch("submit");

  assert.equal(calls, 0);
  assert.equal(document.getElementById("target-x").attributes.get("aria-invalid"), "true");
  assert.match(document.getElementById("app-notice").textContent, /конечные числовые/);
});

test("UI exposes home and camera callbacks and loading state", () => {
  const document = new FakeDocument();
  const ui = new UI(document);
  let homeCalls = 0;
  let fitCalls = 0;
  ui.onHome(() => {
    homeCalls += 1;
  });
  ui.onFitCamera(() => {
    fitCalls += 1;
  });

  ui.setLoading(true);
  assert.equal(document.getElementById("target-submit").disabled, true);

  document.getElementById("target-home").dispatch("click");
  document.getElementById("camera-fit").dispatch("click");
  assert.equal(homeCalls, 1);
  assert.equal(fitCalls, 1);
});
