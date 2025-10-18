# SportsHeart

A comprehensive sports tracking application built with React Native and Expo, featuring real-time scores, standings, player stats, and more across multiple sports leagues.

## 🏆 Features

- **Multi-Sport Support**: NFL, MLB, NBA, WNBA, NHL, F1, Soccer, and Esports
- **Real-time Data**: Live scores, standings, and game details
- **Theme Customization**: Dynamic color themes and dark/light mode
- **Dynamic App Icons**: iOS app icon changes based on user theme
- **Video Splash Screen**: Animated startup experience
- **Favorites Management**: Track your favorite teams across all sports
- **Player & Team Pages**: Detailed statistics and information

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Expo CLI (`npm install -g @expo/cli`)
- EAS CLI (`npm install -g @expo/eas-cli`)

### Development
```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on specific platforms
npm run ios
npm run android
npm run web
```

### Building for Production
```bash
# Build for iOS
npm run build:ios

# Build for Android  
npm run build:android

# Build for both platforms
npm run build:all
```

### App Store Submission
```bash
# Submit to iOS App Store
npm run submit:ios

# Submit to Google Play Store
npm run submit:android
```

## 📱 Platform Support

- **iOS**: Full feature support including dynamic app icons
- **Android**: Full feature support (dynamic icons not supported by platform)
- **Web**: Basic functionality for development

## 🎨 Theming

The app supports multiple color themes:
- Blue (Classic Blue)
- Red (Championship Red)
- Green (Victory Green)
- Purple (Royal Purple)
- Gold (Golden Glory)

Each theme includes:
- Light and dark mode variants
- Custom splash screens
- Dynamic app icons (iOS only)

## 🔧 Configuration

### Environment Variables
- Copy `.env.development` for development
- Copy `.env.production` for production builds
- Update API endpoints and app configuration as needed

### EAS Configuration
- Update `eas.json` with your Apple Developer and Google Play credentials
- Configure build profiles for development, preview, and production

## 📦 Build Profiles

- **Development**: Includes debugging tools and development features
- **Preview**: Internal distribution builds for testing
- **Production**: Optimized builds ready for app store submission

## 🚀 Deployment

The app is configured for deployment using Expo Application Services (EAS):

1. **Setup EAS Project**: `eas init`
2. **Configure Credentials**: Update Apple ID and Google Service Account in `eas.json`
3. **Build**: Use the npm scripts or EAS CLI directly
4. **Submit**: Automated submission to app stores

## 📝 License

All rights reserved. This project is proprietary software.

## 🆘 Support

For support and questions, please contact the development team.

---

Built with ❤️ using React Native and Expo