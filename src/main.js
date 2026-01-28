import { createAudioManager } from "./modules/audioManager.js";
import { createVisualizer } from "./modules/visualizer.js";

const canvas = document.getElementById("visualizer");
const micToggle = document.getElementById("mic-toggle");
const micStatus = document.getElementById("mic-status");
const sensitivityInput = document.getElementById("sensitivity");
const smoothingInput = document.getElementById("smoothing");
const idleSpeedInput = document.getElementById("idle-speed");
const radialScatterInput = document.getElementById("radial-scatter");
const tangentialScatterInput = document.getElementById("tangential-scatter");
const sensitivityValue = document.getElementById("sensitivity-value");
const smoothingValue = document.getElementById("smoothing-value");
const idleSpeedValue = document.getElementById("idle-speed-value");
const radialScatterValue = document.getElementById("radial-scatter-value");
const tangentialScatterValue = document.getElementById("tangential-scatter-value");
const controlsToggle = document.getElementById("controls-toggle");
const controlsPanel = document.getElementById("controls-panel");

const audio = createAudioManager();
const visualizer = createVisualizer(canvas);

let micActive = false;

function setStatus(text, mode) {
  micStatus.textContent = text;
  micStatus.classList.remove("status-idle", "status-active", "status-error");
  micStatus.classList.add(`status-${mode}`);
}

async function startMic() {
  try {
    await audio.start();
    micActive = true;
    micToggle.textContent = "Stop microphone";
    setStatus("Listening…", "active");
    visualizer.setAudioSource(audio);
  } catch (err) {
    console.error(err);
    setStatus("Mic blocked or unavailable", "error");
  }
}

async function stopMic() {
  audio.stop();
  micActive = false;
  micToggle.textContent = "Start microphone";
  setStatus("Idle", "idle");
}

micToggle.addEventListener("click", () => {
  if (!micActive) {
    startMic();
  } else {
    stopMic();
  }
});

function updateSensitivityValue() {
  const value = parseFloat(sensitivityInput.value);
  sensitivityValue.textContent = value.toFixed(1);
  visualizer.setSensitivity(value);
}

function updateSmoothingValue() {
  const value = parseFloat(smoothingInput.value);
  smoothingValue.textContent = value.toFixed(2);
  visualizer.setSmoothing(value);
}

function updateIdleSpeedValue() {
  const value = parseFloat(idleSpeedInput.value);
  idleSpeedValue.textContent = value.toFixed(1);
  visualizer.setIdleSpeed(value);
}

function updateRadialScatterValue() {
  const value = parseFloat(radialScatterInput.value);
  radialScatterValue.textContent = value.toFixed(1);
  visualizer.setRadialScatter(value);
}

function updateTangentialScatterValue() {
  const value = parseFloat(tangentialScatterInput.value);
  tangentialScatterValue.textContent = value.toFixed(1);
  visualizer.setTangentialScatter(value);
}

sensitivityInput.addEventListener("input", updateSensitivityValue);
smoothingInput.addEventListener("input", updateSmoothingValue);
idleSpeedInput.addEventListener("input", updateIdleSpeedValue);
radialScatterInput.addEventListener("input", updateRadialScatterValue);
tangentialScatterInput.addEventListener("input", updateTangentialScatterValue);

controlsToggle.addEventListener("click", () => {
  const isHidden = controlsPanel.classList.toggle("hidden");
  controlsToggle.classList.toggle("open", !isHidden);
});

// Initialize defaults and display values
updateSensitivityValue();
updateSmoothingValue();
updateIdleSpeedValue();
updateRadialScatterValue();
updateTangentialScatterValue();

// Initialize panel state (hidden by default)
controlsPanel.classList.add("hidden");
controlsToggle.classList.remove("open");

visualizer.start();

