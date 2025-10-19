#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Build hook to create GoogleService-Info.plist from environment variable during EAS build
if (process.env.GOOGLE_SERVICES_PLIST) {
  console.log('🔥 Creating GoogleService-Info.plist from environment variable...');
  
  try {
    const plistContent = Buffer.from(process.env.GOOGLE_SERVICES_PLIST, 'base64').toString('utf8');
    const outputPath = path.join(__dirname, '..', 'GoogleService-Info.plist');
    
    fs.writeFileSync(outputPath, plistContent);
    console.log('✅ GoogleService-Info.plist created successfully');
  } catch (error) {
    console.error('❌ Failed to create GoogleService-Info.plist:', error);
    process.exit(1);
  }
} else {
  console.log('⚠️ GOOGLE_SERVICES_PLIST environment variable not found');
}