# PWA / Mobile Install Checklist (v1.0.0)

## PWA (web)
- [ ] `app.json` `expo.web.favicon` set to a 192px PNG
- [ ] `app.json` `expo.web.name` and `expo.web.shortName` configured
- [ ] Add `manifest.json` via Expo's PWA support: `"web": { "output": "static", "bundler": "metro" }`
- [ ] Service worker registered for offline support (Expo's default registers on `expo export`)
- [ ] `apple-touch-icon.png` 180×180 served with correct headers
- [ ] Manual: Lighthouse PWA score ≥ 90 on prod URL
- [ ] Manual: “Add to Home Screen” works on iOS Safari and Android Chrome

## iOS (Expo Go / TestFlight)
- [ ] `app.json` `expo.ios.bundleIdentifier` is unique (e.g. `app.ruleforge.chess`)
- [ ] `expo.ios.infoPlist` permission strings declared (currently none required — we don’t access camera/mic/contacts)
- [ ] App icon and splash configured under `expo.icon` and `expo.splash`
- [ ] `eas build --platform ios --profile production` completes
- [ ] Submit to TestFlight; smoke test on a physical device

## Android (Expo Go / Play Internal)
- [ ] `app.json` `expo.android.package` matches the iOS bundle id
- [ ] `expo.android.permissions` declared (currently none required)
- [ ] `eas build --platform android --profile production` completes
- [ ] Upload AAB to Play Console internal testing
- [ ] Smoke test on a physical Android device

## Final acceptance
- [ ] PWA install on iPhone Safari, taps and gestures normal
- [ ] PWA install on Android Chrome, splash + icon correct
- [ ] App icon and splash render correctly on both stores
