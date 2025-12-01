class PartyApp {
    constructor() {
        this.cameraStream = null;
        this.currentImage = null;
        this.init();
    }

    async init() {
        this.setupTabs();
        this.setupEvents();
        await this.loadStats();
        
        // Request camera permission early
        this.requestCameraPermission();
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.closest('.tab-btn').dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Show content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
        
        // Stop camera if leaving scan tab
        if (tabName !== 'scan') {
            this.stopCamera();
            this.hideCamera();
        }
    }

    setupEvents() {
        // Generate tab
        document.getElementById('generateBtn').onclick = () => this.generateBarcode();
        document.getElementById('downloadBtn').onclick = () => this.downloadImage();
        document.getElementById('newBtn').onclick = () => this.resetGenerator();
        
        // Scan tab
        document.getElementById('cameraBtn').onclick = () => this.startCamera();
        document.getElementById('manualBtn').onclick = () => this.showManual();
        document.getElementById('captureBtn').onclick = () => this.capturePhoto();
        document.getElementById('checkBtn').onclick = () => this.checkManual();
        document.getElementById('fileInput').onchange = (e) => this.handleFileUpload(e);
    }

    async requestCameraPermission() {
        try {
            // Just check if we can get camera (don't start it yet)
            await navigator.mediaDevices.getUserMedia({ video: true });
            console.log('Camera permission granted');
        } catch (err) {
            console.warn('Camera permission not granted yet:', err);
        }
    }

    async startCamera() {
        try {
            this.stopCamera();
            this.hideManual();
            
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.getElementById('camera');
            video.srcObject = this.cameraStream;
            
            document.getElementById('camera-box').classList.remove('hidden');
            this.showToast('Camera ready. Point at barcode.', 'success');
            
        } catch (err) {
            console.error('Camera error:', err);
            this.showToast('Camera access denied. Use manual entry or upload.', 'error');
            this.showManual();
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
    }

    hideCamera() {
        document.getElementById('camera-box').classList.add('hidden');
    }

    showManual() {
        this.stopCamera();
        this.hideCamera();
        document.getElementById('manual-box').classList.remove('hidden');
        document.getElementById('manualCode').focus();
    }

    hideManual() {
        document.getElementById('manual-box').classList.add('hidden');
    }

    capturePhoto() {
        const video = document.getElementById('camera');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/jpeg');
        this.scanImage(imageData);
    }

    async scanImage(imageData) {
        const btn = document.getElementById('captureBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
        btn.disabled = true;
        
        try {
            const response = await fetch('/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: imageData })
            });
            
            const result = await response.json();
            this.handleScanResult(result);
            
        } catch (error) {
            this.showToast('Scan failed. Try again.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.scanImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    async checkManual() {
        const code = document.getElementById('manualCode').value.trim();
        if (!code) {
            this.showToast('Please enter a code', 'warning');
            return;
        }
        
        const btn = document.getElementById('checkBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
        btn.disabled = true;
        
        try {
            const response = await fetch(`/validate/${encodeURIComponent(code)}`);
            const result = await response.json();
            this.handleScanResult(result);
            document.getElementById('manualCode').value = '';
        } catch (error) {
            this.showToast('Check failed. Try again.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    handleScanResult(result) {
        if (!result.success) {
            this.showToast(result.error, 'error');
            return;
        }
        
        this.addResult(result);
        this.loadStats();
        
        if (result.valid) {
            this.showToast('Access granted!', 'success');
        } else {
            this.showToast('Invalid code', 'warning');
        }
    }

    addResult(result) {
        const resultsDiv = document.getElementById('results');
        const item = document.createElement('div');
        item.className = `result-item result-${result.status}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">
                ${result.message}
            </div>
            ${result.staff_name ? `<div>Name: ${result.staff_name}</div>` : ''}
            <div style="font-size: 0.8rem; color: #666; margin-top: 5px;">${time}</div>
        `;
        
        resultsDiv.insertBefore(item, resultsDiv.firstChild);
        
        // Keep only last 10 results
        while (resultsDiv.children.length > 10) {
            resultsDiv.removeChild(resultsDiv.lastChild);
        }
    }

    async generateBarcode() {
        const name = document.getElementById('staffName').value.trim();
        if (!name) {
            this.showToast('Please enter name', 'warning');
            return;
        }
        
        const btn = document.getElementById('generateBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        btn.disabled = true;
        
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staff_name: name })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showBarcode(result);
                this.showToast('Barcode created!', 'success');
                this.loadStats();
            } else {
                this.showToast(result.error, 'error');
            }
        } catch (error) {
            this.showToast('Creation failed', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    showBarcode(result) {
        document.getElementById('generatedBarcode').src = result.image_data;
        document.getElementById('resultStaffName').textContent = result.staff_name;
        document.getElementById('resultCode').textContent = result.code;
        
        this.currentImage = result.filename;
        document.getElementById('result-card').classList.remove('hidden');
    }

    async downloadImage() {
        if (!this.currentImage) return;
        
        try {
            const response = await fetch(`/download/${this.currentImage}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.currentImage;
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                document.body.removeChild(a);
                this.showToast('Image saved!', 'success');
            }
        } catch (error) {
            this.showToast('Download failed', 'error');
        }
    }

    resetGenerator() {
        document.getElementById('staffName').value = '';
        document.getElementById('result-card').classList.add('hidden');
        this.currentImage = null;
    }

    async loadStats() {
        try {
            const response = await fetch('/stats');
            const stats = await response.json();
            
            document.getElementById('generated-count').textContent = stats.generated;
            document.getElementById('scanned-count').textContent = stats.scanned;
        } catch (error) {
            console.error('Stats error:', error);
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PartyApp();
    
    // Enable PWA features
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('SW registration failed:', err));
    }
});