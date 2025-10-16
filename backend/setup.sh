#!/bin/bash

echo "🚀 Setting up Sports Tracker Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis is not installed. Please install Redis first."
    echo "On Ubuntu: sudo apt install redis-server"
    echo "On macOS: brew install redis"
    echo "On Windows: Use Redis for Windows or Docker"
    exit 1
fi

# Navigate to backend directory
cd backend

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
fi

# Start Redis if not running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "🔴 Starting Redis server..."
    redis-server --daemonize yes
fi

# Generate VAPID keys for push notifications
echo "🔑 Generating VAPID keys for push notifications..."
node -e "
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
" >> .env.vapid

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env file with your configuration"
echo "2. Add the VAPID keys from .env.vapid to your .env file"
echo "3. Run 'npm start' to start the server"
echo "4. Test the health endpoint: curl http://localhost:3001/health"