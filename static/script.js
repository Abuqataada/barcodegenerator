class PartyApp {
    constructor() {
        this.cameraStream = null;
        this.currentImageData = null;

        this.data = JSON.parse(localStorage.getItem("party_data")) || {
            invites: [],      // {name, code, image}
            checkins: []      // {code, name, time}
        };

        this.init();
    }

    init() {
        this.setupTabs();
        this.setupEvents();
        this.updateStats();
        this.preloadCameraPermission();
    }

    saveData() {
        localStorage.setItem("party_data", JSON.stringify(this.data));
    }

    /* --------------------------
       TAB HANDLING
    --------------------------- */
    setupTabs() {
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        document.querySelectorAll(".tab-btn").forEach(btn =>
            btn.classList.toggle("active", btn.dataset.tab === tab)
        );

        document.querySelectorAll(".tab-content").forEach(c =>
            c.classList.toggle("active", c.id === `${tab}-tab`)
        );

        if (tab !== "scan") this.stopCamera();
    }

    /* --------------------------
       GENERAL UI HELPERS
    --------------------------- */
    toast(msg, type = "info") {
        const t = document.getElementById("toast");
        t.textContent = msg;
        t.className = `toast show ${type}`;
        setTimeout(() => t.classList.remove("show"), 2500);
    }

    updateStats() {
        document.getElementById("generated-count").textContent = this.data.invites.length;
        document.getElementById("scanned-count").textContent  = this.data.checkins.length;
    }

    /* --------------------------
       CAMERA PERMISSION
    --------------------------- */
    async preloadCameraPermission() {
        try { await navigator.mediaDevices.getUserMedia({ video: true }); }
        catch (_) {}
    }

    /* --------------------------
       GENERATE BARCODE
    --------------------------- */
    setupEvents() {
        document.getElementById("generateBtn").onclick = () => this.generate();
        document.getElementById("newBtn").onclick      = () => this.resetGenerator();
        document.getElementById("downloadBtn").onclick = () => this.downloadImage();

        document.getElementById("cameraBtn").onclick   = () => this.startCamera();
        document.getElementById("manualBtn").onclick   = () => this.showManual();
        document.getElementById("captureBtn").onclick  = () => this.captureFrame();
        document.getElementById("checkBtn").onclick    = () => this.checkManual();

        document.getElementById("fileInput").onchange  = e => this.uploadImage(e);
    }

    generate() {
        const name = document.getElementById("staffName").value.trim();
        if (!name) return this.toast("Enter staff name", "warning");

        const code = "ARD_" + Math.random().toString(36).substring(2, 10).toUpperCase();

        // Generate barcode using bwip-js
        const canvas = document.createElement("canvas");
        try {
            bwipjs.toCanvas(canvas, {
                bcid: "code128",
                text: code,
                scale: 3,
                height: 10
            });
        } catch(e) {
            return this.toast("Barcode generation failed", "error");
        }

        const imageData = canvas.toDataURL("image/png");

        this.data.invites.push({ name, code, image: imageData });
        this.saveData();
        this.updateStats();

        document.getElementById("generatedBarcode").src = imageData;
        document.getElementById("resultStaffName").textContent = name;
        document.getElementById("resultCode").textContent = code;

        this.currentImageData = imageData;

        document.getElementById("result-card").classList.remove("hidden");
        this.toast("Invitation Created", "success");
    }

    resetGenerator() {
        document.getElementById("staffName").value = "";
        document.getElementById("result-card").classList.add("hidden");
        this.currentImageData = null;
    }

    downloadImage() {
        if (!this.currentImageData) return;

        const a = document.createElement("a");
        a.href = this.currentImageData;
        a.download = "invite.png";
        a.click();
    }

    /* --------------------------
       CAMERA SCANNING
    --------------------------- */
    async startCamera() {
        try {
            this.stopCamera();
            const video = document.getElementById("camera");
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }});
            video.srcObject = this.cameraStream;

            document.getElementById("camera-box").classList.remove("hidden");
            document.getElementById("manual-box").classList.add("hidden");
        } catch (e) {
            this.toast("Cannot access camera", "error");
            this.showManual();
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(t => t.stop());
            this.cameraStream = null;
        }
        document.getElementById("camera-box").classList.add("hidden");
    }

    captureFrame() {
        const video = document.getElementById("camera");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);

        this.scanImage(canvas);
    }

    /* --------------------------
       IMAGE SCANNING (JSQR)
    --------------------------- */
    async uploadImage(ev) {
        const file = ev.target.files[0];
        if (!file) return;

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext("2d").drawImage(img, 0, 0);
            this.scanImage(canvas);
        };
        img.src = URL.createObjectURL(file);
    }

    scanImage(canvas) {
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const qr = jsQR(imageData.data, canvas.width, canvas.height);
        if (!qr) return this.toast("No code detected", "warning");

        this.validateCode(qr.data);
    }

    /* --------------------------
       VALIDATION (LOCAL)
    --------------------------- */
    validateCode(code) {
        const invite = this.data.invites.find(i => i.code === code);
        const resultsDiv = document.getElementById("results");

        if (!invite) {
            this.toast("Invalid Code", "error");
            return;
        }

        // Record check-in
        this.data.checkins.push({
            code,
            name: invite.name,
            time: new Date().toLocaleTimeString()
        });
        this.saveData();
        this.updateStats();

        const item = document.createElement("div");
        item.className = "result-item result-success";
        item.innerHTML = `
            <strong>${invite.name}</strong><br>
            Code: ${invite.code}<br>
            <small>${new Date().toLocaleTimeString()}</small>
        `;
        resultsDiv.prepend(item);

        this.toast("Access Granted", "success");
    }

    /* --------------------------
       MANUAL ENTRY
    --------------------------- */
    showManual() {
        this.stopCamera();
        document.getElementById("manual-box").classList.remove("hidden");
        document.getElementById("manualCode").focus();
    }

    checkManual() {
        const code = document.getElementById("manualCode").value.trim();
        if (!code) return this.toast("Enter a code", "warning");
        this.validateCode(code);
        document.getElementById("manualCode").value = "";
    }
}

/* --------------------------
   INIT APP
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    window.app = new PartyApp();
});
