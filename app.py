import os
import json
import random
import string
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
import qrcode
from pyzbar.pyzbar import decode
from PIL import Image
import io
import base64

app = Flask(__name__)

# Configuration
app.config['DATA_DIR'] = 'data'
app.config['IMAGES_DIR'] = 'barcode_images'
app.config['SECRET_KEY'] = 'arndale-party-2024'

# Ensure directories exist
os.makedirs(app.config['DATA_DIR'], exist_ok=True)
os.makedirs(app.config['IMAGES_DIR'], exist_ok=True)

# Database files
GENERATED_DB = os.path.join(app.config['DATA_DIR'], 'generated_codes.json')
SCANNED_DB = os.path.join(app.config['DATA_DIR'], 'scanned_codes.json')

def initialize_database():
    """Initialize JSON database files"""
    for db_file in [GENERATED_DB, SCANNED_DB]:
        if not os.path.exists(db_file):
            with open(db_file, 'w') as f:
                json.dump({}, f)

def generate_secret_code():
    """Generate unique secret code for barcode"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    random_chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ARD_{timestamp}_{random_chars}"

@app.route('/')
def index():
    """Main application page"""
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
def generate_barcode():
    """Generate new barcode"""
    data = request.get_json()
    staff_name = data.get('staff_name', '').strip()
    
    if not staff_name:
        return jsonify({'success': False, 'error': 'Name is required'})
    
    # Generate unique code
    secret_code = generate_secret_code()
    
    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(secret_code)
    qr.make(fit=True)
    
    # Generate QR code image
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Save image
    filename = f"invite_{staff_name.replace(' ', '_')[:20]}_{datetime.now().strftime('%H%M%S')}.png"
    image_path = os.path.join(app.config['IMAGES_DIR'], filename)
    qr_img.save(image_path)
    
    # Convert to base64 for immediate display
    buffered = io.BytesIO()
    qr_img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    # Save to database
    initialize_database()
    with open(GENERATED_DB, 'r') as f:
        generated_data = json.load(f)
    
    generated_data[secret_code] = {
        'staff_name': staff_name,
        'generated_time': datetime.now().isoformat(),
        'image_path': image_path,
        'filename': filename,
        'scanned': False
    }
    
    with open(GENERATED_DB, 'w') as f:
        json.dump(generated_data, f, indent=2)
    
    return jsonify({
        'success': True,
        'code': secret_code,
        'staff_name': staff_name,
        'image_data': f"data:image/png;base64,{img_str}",
        'filename': filename
    })

@app.route('/scan', methods=['POST'])
def scan_barcode():
    """Scan barcode from image data"""
    data = request.get_json()
    image_data = data.get('image_data', '')
    
    if not image_data:
        return jsonify({'success': False, 'error': 'No image data'})
    
    try:
        # Remove data URL prefix
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Decode QR code
        decoded_objects = decode(image)
        
        if not decoded_objects:
            return jsonify({'success': False, 'error': 'No barcode found'})
        
        # Get the first barcode
        barcode_data = decoded_objects[0].data.decode('utf-8')
        
        # Validate the code
        return validate_code(barcode_data)
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Scan error: {str(e)}'})

@app.route('/validate/<code>')
def validate_code_manual(code):
    """Validate a code manually"""
    return validate_code(code)

def validate_code(code):
    """Validate barcode against database"""
    initialize_database()
    
    try:
        with open(GENERATED_DB, 'r') as f:
            generated_data = json.load(f)
        
        with open(SCANNED_DB, 'r') as f:
            scanned_data = json.load(f)
        
        if code in generated_data:
            # Valid code - grant access
            staff_info = generated_data.pop(code)
            staff_info['scanned_time'] = datetime.now().isoformat()
            staff_info['scanned'] = True
            
            scanned_data[code] = staff_info
            
            # Update databases
            with open(GENERATED_DB, 'w') as f:
                json.dump(generated_data, f, indent=2)
            
            with open(SCANNED_DB, 'w') as f:
                json.dump(scanned_data, f, indent=2)
            
            return jsonify({
                'success': True,
                'valid': True,
                'message': f"✅ Welcome {staff_info['staff_name']}!",
                'staff_name': staff_info['staff_name'],
                'status': 'granted'
            })
            
        elif code in scanned_data:
            return jsonify({
                'success': True,
                'valid': False,
                'message': f"⚠️ Already used for {scanned_data[code]['staff_name']}",
                'staff_name': scanned_data[code]['staff_name'],
                'status': 'used'
            })
        else:
            return jsonify({
                'success': True,
                'valid': False,
                'message': "❌ Invalid code",
                'status': 'invalid'
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Database error: {str(e)}'})

@app.route('/download/<filename>')
def download_barcode(filename):
    """Download barcode image"""
    file_path = os.path.join(app.config['IMAGES_DIR'], filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return jsonify({'success': False, 'error': 'File not found'})

@app.route('/stats')
def get_stats():
    """Get statistics"""
    initialize_database()
    
    with open(GENERATED_DB, 'r') as f:
        generated_data = json.load(f)
    
    with open(SCANNED_DB, 'r') as f:
        scanned_data = json.load(f)
    
    return jsonify({
        'generated': len(generated_data),
        'scanned': len(scanned_data),
        'remaining': len(generated_data)
    })

if __name__ == '__main__':
    initialize_database()
    # Run with HTTPS for camera access
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc')