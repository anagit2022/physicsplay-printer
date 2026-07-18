let cardCount = 0;
const cardsContainer = document.getElementById("cardsContainer");

document.getElementById("addCardButton").addEventListener("click", createObservationCard);

// start with one card ready to go
createObservationCard();

function createObservationCard(){
    cardCount++;

    const card = document.createElement("div");
    card.className = "obs-card";
    card.dataset.id = cardCount;

    card.innerHTML = `
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
    `;

    cardsContainer.appendChild(card);
    setupCard(card);
}

function setupCard(card){
    const video = card.querySelector(".obs-video");
    const videoWrap = card.querySelector(".obs-video-wrap");
    const recordBtn = card.querySelector(".record-btn");
    const timerEl = card.querySelector(".record-timer");

    let stream = null;
    let mediaRecorder = null;
    let chunks = [];
    let recording = false;
    let timerInterval = null;
    let seconds = 0;
    let recordedUrl = null;

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

    // ---- help button ----
    card.querySelector(".help-btn").addEventListener("click", () => {
        alert("Try describing: what changed when you adjusted amplitude or speed, whether the motion looked steady or grew larger over time, and why you think that happened.");
    });

    // ---- save: lock the card, offer the recording for download ----
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
            card.appendChild(dl);
        }
    });
}
