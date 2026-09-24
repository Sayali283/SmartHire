"""
SmartHire Launcher

Simple script to start the Flask backend server.

The React frontend is served by Flask - just run this script and navigate to http://localhost:5000
"""

import subprocess
import sys
import os
import time
import webbrowser
from pathlib import Path


def check_flask_installed():
    """Check if Flask is installed"""
    try:
        import flask
        return True
    except ImportError:
        return False


def install_requirements():
    """Install required packages from requirements.txt"""
    print("Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✓ Dependencies installed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to install dependencies: {e}")
        return False


def start_server():
    """Start the Flask backend server"""
    print("\n" + "=" * 60)
    print("SmartHire Backend Server")
    print("=" * 60)
    print("Starting Flask server...")
    print("=" * 60)
    
    try:
        # Import and run the backend
        from backend import app
        
        port = 5000
        print(f"\n✓ Server starting on: http://localhost:{port}")
        print(f"✓ Navigate to http://localhost:{port}/ in your browser")
        print(f"✓ Press Ctrl+C to stop the server\n")
        
        # Optional: Open browser automatically
        # time.sleep(1)
        # webbrowser.open(f'http://localhost:{port}')

        # Debug mode is controlled by FLASK_ENV so it's never accidentally left
        # on in production (the Werkzeug debugger allows arbitrary code
        # execution from the browser if it's exposed publicly).
        debug = os.environ.get('FLASK_ENV', '').lower() == 'development'
        app.run(host='0.0.0.0', port=port, debug=debug)
        
    except ImportError as e:
        print(f"\n✗ Error: {e}")
        print("Make sure you're in the correct directory and all files exist.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Server error: {e}")
        sys.exit(1)


def main():
    """Main entry point"""
    print("\n" + "=" * 60)
    print("SmartHire Project Launcher")
    print("=" * 60 + "\n")
    
    # Check if we're in the right directory
    required_files = ["backend.py", "requirements.txt", "index.html"]
    missing_files = []
    
    for file in required_files:
        if not os.path.exists(file):
            missing_files.append(file)
    
    if missing_files:
        print(f"✗ Error: Missing required files: {', '.join(missing_files)}")
        print("Make sure you're running this from the SmartHire project directory.")
        sys.exit(1)
    
    # Check if Flask is installed
    if not check_flask_installed():
        print("✗ Flask is not installed.")
        print("Installing required dependencies...")
        if not install_requirements():
            print("✗ Failed to install dependencies. Please try manually:")
            print("   pip install -r requirements.txt")
            sys.exit(1)
    
    # Start the server
    start_server()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n✓ Server stopped. Goodbye!")
        sys.exit(0)
