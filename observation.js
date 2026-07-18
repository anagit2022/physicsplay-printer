let cardCount = 0;
const cardsContainer = document.getElementById("cardsContainer");

// ---- remember the Gemini key across reloads (this browser only) ----
const geminiKeyInput = document.getElementById("geminiKey");
const savedKey = localStorage.getItem("geminiApiKey");
if(savedKey) geminiKeyInput.value = savedKey;
geminiKeyInput.addEventListener("input", () => {
    localStorage.setItem("geminiApiKey", geminiKeyInput.value);
});

document.getElementById("addCardButton").addEventListener("click", createObservationCard);

// start with one card ready to go
createObservationCard();

function createObservationCard(){
    cardCount++;

    const card = document.createElement("div");
    card.className = "obs-card";
    card.dataset.id = cardCount;

    card.innerHTML = `
        <div class="obs-card-header">
            <span class="obs-card-title">New observation</span>
            <div class="obs-card-actions">
                <button type="button" class="delete-btn" title="Delete card">&#128465;</button>
                <button type="button" class="toggle-btn" title="Expand/collapse">&#8964;</button>
            </div>
        </div>

        <div class="obs-card-body">
            <div class="obs-video-wrap">
                <video class="obs-video" autoplay muted playsinline></video>
                <button class="record-btn" title="Start/stop recording"></button>
                <div class="record-timer" style="display:none;">00:00</div>
            </div>

            <div class="obs-field">
                <label>Case</label>
                <input type="text" class="case-input" placeholder="e.g. Swaying of flower stem (Resonance)">
            </div>

            <table class="obs-table">
                <tbody>
                    <tr>
                        <th>Length of stem :</th>
                        <td><input type="text"></td><td><input type="text"></td><td><input type="text"></td>
                    </tr>
                    <tr>
                        <th>Flower size :</th>
                        <td><input type="text"></td><td><input type="text"></td><td><input type="text"></td>
                    </tr>
                    <tr>
                        <th>Head weight :</th>
                        <td><input type="text"></td><td><input type="text"></td><td><input type="text"></td>
                    </tr>
                    <tr>
                        <th>Y distance pushed :</th>
                        <td><input type="text" class="amp-fill"></td><td><input type="text"></td><td><input type="text"></td>
                    </tr>
                    <tr>
                        <th>Speed of motion :</th>
                        <td><input type="text" class="speed-fill"></td><td><input type="text"></td><td><input type="text"></td>
                    </tr>
                </tbody>
            </table>
            <button type="button" class="fill-btn">Fill from current sliders</button>

            <div class="obs-field">
                <label>Insight</label>
                <div class="insight-wrap">
                    <textarea class="insight-input" rows="3" placeholder="What did you notice?"></textarea>
                    <button type="button" class="help-btn">Help</button>
                </div>
            </div>

            <button type="button" class="save-obs-btn">Save observation</button>
        </div>
    `;

    cardsContainer.appendChild(card);
    setupCard(card);
}

function setupCard(card){
    const video = card.querySelector(".obs-video");
    const videoWrap = card.querySelector(".obs-video-wrap");
    const recordBtn = card.querySelector(".record-btn");
    const timerEl = card.querySelector(".record-timer");
    const titleEl = card.querySelector(".obs-card-title");
    const caseInput = card.querySelector(".case-input");
    const toggleBtn = card.querySelector(".toggle-btn");
    const deleteBtn = card.querySelector(".delete-btn");
    const header = card.querySelector(".obs-card-header");

    let stream = null;
    let mediaRecorder = null;
    let chunks = [];
    let recording = false;
    let timerInterval = null;
    let seconds = 0;
    let recordedUrl = null;

    // ---- collapse / expand ----
    function setCollapsed(collapsed){
        card.classList.toggle("collapsed", collapsed);
    }
    header.addEventListener("click", (e) => {
        if(e.target.closest(".delete-btn")) return;
        setCollapsed(!card.classList.contains("collapsed"));
    });
    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setCollapsed(!card.classList.contains("collapsed"));
    });

    // ---- keep the collapsed-row title in sync with the Case field ----
    caseInput.addEventListener("input", () => {
        titleEl.textContent = caseInput.value.trim() || "New observation";
    });

    // ---- delete this card ----
    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if(recording && mediaRecorder){
            mediaRecorder.stop();
        }
        if(stream){
            stream.getTracks().forEach(t => t.stop());
        }
        if(recordedUrl){
            URL.revokeObjectURL(recordedUrl);
        }
        clearInterval(timerInterval);
        card.remove();
    });

    // ---- open the camera as soon as the card is created ----
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: true
        }).then(s => {
            stream = s;
            video.srcObject = stream;
        }).catch(err => {
            videoWrap.innerHTML = `<div class="camera-error">Camera unavailable: ${err.message}<br>(needs HTTPS or localhost, and camera permission)</div>`;
        });
    }else{
        videoWrap.innerHTML = `<div class="camera-error">This browser doesn't support camera recording.</div>`;
    }

    // ---- record / stop ----
    recordBtn.addEventListener("click", () => {
        if(!stream) return;

        if(!recording){
            chunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => {
                if(e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: "video/webm" });
                recordedUrl = URL.createObjectURL(blob);
                video.srcObject = null;
                video.src = recordedUrl;
                video.muted = false;
                video.controls = true;
            };
            mediaRecorder.start();
            recording = true;
            recordBtn.classList.add("recording");

            seconds = 0;
            timerEl.style.display = "block";
            timerEl.textContent = "00:00";
            timerInterval = setInterval(() => {
                seconds++;
                const m = String(Math.floor(seconds / 60)).padStart(2, "0");
                const s = String(seconds % 60).padStart(2, "0");
                timerEl.textContent = `${m}:${s}`;
            }, 1000);
        }else{
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
            recording = false;
            recordBtn.classList.remove("recording");
            clearInterval(timerInterval);
            timerEl.style.display = "none";
        }
    });

    // ---- pull current Amplitude/Speed slider values into the table ----
    card.querySelector(".fill-btn").addEventListener("click", () => {
        if(typeof getValues !== "function") return;
        const { amp, speed } = getValues();
        const ampBox = card.querySelector(".amp-fill");
        const speedBox = card.querySelector(".speed-fill");
        if(ampBox) ampBox.value = amp;
        if(speedBox) speedBox.value = speed;
    });

    // ---- help button: ask Gemini to draft an insight from this card's data ----
    card.querySelector(".help-btn").addEventListener("click", () => {
        askGeminiForInsight(card);
    });

    // ---- save: lock the card, collapse it, offer the recording for download ----
    card.querySelector(".save-obs-btn").addEventListener("click", () => {
        card.querySelectorAll("input, textarea").forEach(el => el.setAttribute("readonly", true));

        const saveBtn = card.querySelector(".save-obs-btn");
        saveBtn.textContent = "Saved \u2713";
        saveBtn.disabled = true;

        card.querySelector(".fill-btn").disabled = true;
        card.classList.add("saved");

        if(recording){
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
            recording = false;
            clearInterval(timerInterval);
        }

        if(recordedUrl){
            const dl = document.createElement("a");
            dl.href = recordedUrl;
            dl.download = `observation_${card.dataset.id}.webm`;
            dl.textContent = "Download video";
            dl.className = "download-link";
            card.querySelector(".obs-card-body").appendChild(dl);
        }

        setCollapsed(true);
    });
}

// ---- gathers a card's Case, measurements, and existing notes ----
function collectCardData(card){
    const caseText = card.querySelector(".case-input").value.trim() || "Untitled experiment";

    const measurementLines = [];
    card.querySelectorAll(".obs-table tr").forEach(row => {
        const label = row.querySelector("th").textContent.replace(":", "").trim();
        const values = Array.from(row.querySelectorAll("input"))
            .map(i => i.value.trim())
            .filter(v => v !== "");
        if(values.length > 0){
            measurementLines.push(`${label}: ${values.join(", ")}`);
        }
    });

    const existingInsight = card.querySelector(".insight-input").value.trim();

    return { caseText, measurementLines, existingInsight };
}

// ---- sends the card's data to Gemini and drops the result into Insight ----
async function askGeminiForInsight(card){
    const key = geminiKeyInput.value.trim();
    if(!key){
        alert("Add your Gemini API key above first (Google AI Studio issues free keys).");
        return;
    }

    const helpBtn = card.querySelector(".help-btn");
    const insightInput = card.querySelector(".insight-input");
    const originalLabel = helpBtn.textContent;
    helpBtn.textContent = "Thinking...";
    helpBtn.disabled = true;

    const { caseText, measurementLines, existingInsight } = collectCardData(card);

    const prompt = `You are a physics lab assistant helping a student write up a resonance/oscillation experiment.

Case: ${caseText}
Measurements:
${measurementLines.length ? measurementLines.join("\n") : "(none recorded)"}
${existingInsight ? `Student's notes so far: ${existingInsight}` : "Student hasn't written any notes yet."}

Write a short insight (2-4 sentences) explaining what likely happened physically (e.g. resonance, damping, how amplitude/speed relate to what was observed), grounded in the numbers above where possible. Return ONLY the insight text — no preamble, no markdown, no labels.`;

    try{
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );

        if(!response.ok){
            const errText = await response.text();
            throw new Error(`${response.status} ${errText.slice(0, 200)}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if(!text) throw new Error("Empty response from Gemini");

        insightInput.value = existingInsight
            ? `${existingInsight}\n\n--- AI suggestion ---\n${text}`
            : text;
    }catch(err){
        alert("Gemini request failed: " + err.message);
    }finally{
        helpBtn.textContent = originalLabel;
        helpBtn.disabled = false;
    }
}
