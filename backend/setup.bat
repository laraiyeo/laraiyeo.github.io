@echo off
echo 🚀 Setting up Sports Tracker Backend...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Navigate to backend directory
cd backend

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Copy environment file
if not exist .env (
    echo 📝 Creating environment file...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your configuration
)

REM Generate VAPID keys for push notifications
echo 🔑 Generating VAPID keys for push notifications...
node -e "const webpush = require('web-push'); const vapidKeys = webpush.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey); console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);" >> .env.vapid

echo ✅ Setup complete!
echo.
echo 📋 Next steps:
echo 1. Install and start Redis server
echo 2. Update the .env file with your configuration
echo 3. Add the VAPID keys from .env.vapid to your .env file
echo 4. Run 'npm start' to start the server
echo 5. Test the health endpoint: curl http://localhost:3001/health

pause