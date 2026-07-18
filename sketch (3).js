let port;
let writer;
let stopProgram = false;

const consoleDiv = document.getElementById("console");
const motionPreview = document.getElementById("motionPreview");
const connectStatus = document.getElementById("connectStatus");
const playButton = document.getElementById("playButton");

// ---- element refs for each slider/value pair ----
const controls = {
    amp:    { slider: document.getElementById("ampSlider"),    value: document.getElementById("ampValue") },
    speed:  { slider: document.getElementById("speedSlider"),  value: document.getElementById("speedValue") },
    repeat: { slider: document.getElementById("repeatSlider"), value: document.getElementById("repeatValue") },
};

// keep slider <-> number input in sync, and refresh the motion preview
function bindControl(key){
    const { slider, value } = controls[key];
    slider.addEventListener("input", () => {
        value.value = slider.value;
        updateMotionPreview();
    });
    value.addEventListener("input", () => {
        let v = Number(value.value);
        if(!isNaN(v)){
            v = Math.min(Number(slider.max), Math.max(Number(slider.min), v));
            slider.value = v;
        }
        updateMotionPreview();
    });
}
Object.keys(controls).forEach(bindControl);

// +/- step buttons
document.querySelectorAll(".step-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const key = btn.dataset.target;
        const dir = Number(btn.dataset.dir);
        const { slider, value } = controls[key];
        const step = Number(slider.step) || 1;
        let v = Number(slider.value) + dir * step;
        v = Math.min(Number(slider.max), Math.max(Number(slider.min), v));
        slider.value = v;
        value.value = v;
        updateMotionPreview();
    });
});

function getValues(){
    return {
        amp: Number(controls.amp.value.value),
        speed: Number(controls.speed.value.value),
        repeat: Number(controls.repeat.value.value),
    };
}

// reads the Motion textarea and fills in {A} / {F} with the current
// amplitude and speed values
function buildMotionLines(){
    const template = document.getElementById("motionInput").value.split("\n");
    const { amp, speed } = getValues();
    return template
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(line => line
            .replaceAll("{A}", amp)
            .replaceAll("{F}", speed));
}

// figures out the axis letter by looking at whatever comes right before
// the first {A} in the template, e.g. "G0 X{A}" -> "X"
function updateAxisLabel(){
    const template = document.getElementById("motionInput").value;
    const match = template.match(/([A-Za-z])\{A\}/);
    document.getElementById("ampAxis").value = match ? match[1].toUpperCase() : "?";
}

function updateMotionPreview(){
    updateAxisLabel();
    motionPreview.textContent = buildMotionLines().join("\n");
}
document.getElementById("motionInput").addEventListener("input", updateMotionPreview);

updateMotionPreview();

// ---------------- WebSerial ----------------
document.getElementById("connectButton").addEventListener("click", connectPrinter);

async function connectPrinter(){
    try{
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        writer = port.writable.getWriter();
        connectStatus.textContent = "Connected";
        logLine("Connected!");
        readLoop(); // start listening for the printer's "ok" responses
    }catch(err){
        connectStatus.textContent = "Connection failed";
        logLine("Error: " + err.message);
    }
}

// ---- reading responses back from the printer ----
let lineBuffer = "";
let pendingOkResolve = null;

async function readLoop(){
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable); // don't await, runs for life of connection
    const reader = decoder.readable.getReader();
    try{
        while(true){
            const { value, done } = await reader.read();
            if(done) break;
            if(value){
                lineBuffer += value;
                const lines = lineBuffer.split("\n");
                lineBuffer = lines.pop(); // last chunk may be incomplete, keep for next read
                for(let line of lines){
                    line = line.trim();
                    if(line === "") continue;
                    logLine("&lt; " + line);
                    if(line.toLowerCase().includes("ok") && pendingOkResolve){
                        pendingOkResolve();
                        pendingOkResolve = null;
                    }
                }
            }
        }
    }catch(err){
        logLine("Read error: " + err.message);
    }
}

// waits for the next "ok", but gives up after timeoutMs so a dropped
// response can't hang the whole experiment forever
function waitForOk(timeoutMs = 5000){
    return new Promise(resolve => {
        let settled = false;
        pendingOkResolve = () => {
            if(settled) return;
            settled = true;
            resolve();
        };
        setTimeout(() => {
            if(settled) return;
            settled = true;
            pendingOkResolve = null;
            logLine("(no ok received, continuing anyway)");
            resolve();
        }, timeoutMs);
    });
}

async function sendGcode(command){
    if(!writer){
        logLine("Not connected - command not sent: " + command);
        return;
    }
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(command + "\n"));
    logLine("&gt; " + command);
    await waitForOk();
}

function logLine(text){
    consoleDiv.innerHTML += text + "<br>";
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// ---------------- Play experiment ----------------
document.getElementById("playButton").addEventListener("click", playExperiment);
document.getElementById("stopButton").addEventListener("click", () => {
    stopProgram = true;
    logLine("Stopping experiment...");
});

async function playExperiment(){
    stopProgram = false;
    playButton.disabled = true;

    // ---- Setup commands, sent once ----
    const setupCommands = document.getElementById("setupInput").value.split("\n");
    for(let command of setupCommands){
        if(stopProgram) break;
        command = command.trim();
        if(command !== "") await sendGcode(command);
    }

    // ---- Motion loop: runs until Stop is pressed ----
    // buildMotionLines() re-reads the Motion textarea and the sliders every
    // pass, so editing the template or dragging a slider takes effect on
    // the next cycle.
    while(!stopProgram){
        const lines = buildMotionLines();
        for(let line of lines){
            if(stopProgram) break;
            await sendGcode(line);
        }
    }

    logLine("Experiment stopped");
    playButton.disabled = false;
}
