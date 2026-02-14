import 'react-native-gesture-handler';
import { LogBox } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// Suppress "Network request failed" overlay when offline - OfflineBanner handles it
LogBox.ignoreLogs(['Network request failed']);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
