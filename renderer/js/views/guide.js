// Settings › User Guide: step-by-step help for the setups that need a few
// clicks outside the launcher. Rendered by the settings view ('step' items).

import { api } from '../state.js';
import { addGameFolder } from '../ui/filebrowser.js';

const step = (n, label) => ({ type: 'step', n, label });

export function guideCategory(router) {
  const go = (category, section) => () => router.open('settings', { category, section });
  return {
    id: 'guide',
    readable: true,
    label: 'User Guide',
    icon: 'fGuide',
    desc: 'How to set up Discord, artwork, brightness and more',
    sections: [
      {
        label: 'Adding Games',
        items: () => [
          { type: 'header', label: 'Get your games into the launcher' },
          step(1, 'Steam and Epic Games are found automatically. Make sure the Steam and Epic switches are on in Settings › Library.'),
          step(2, 'For any other game, make a folder (for example "D:\\Game Shortcuts") and put shortcuts to your games in it: .lnk, .url or .exe files.'),
          step(3, 'Open Settings › Library and choose Add Folder…, then pick that folder. You can also drag a shortcut or a folder onto the window.'),
          step(4, 'Artwork, logos and descriptions are downloaded automatically. If a game shows the wrong art, open its … menu and choose Change Artwork › Find on Steam…'),
          { type: 'action', icon: 'folderPlus', label: 'Add a Game Folder…', run: () => addGameFolder() },
          { type: 'action', icon: 'settings', label: 'Open Library Settings', run: go('library') },
        ],
      },
      {
        label: 'Connect Discord',
        items: () => [
          { type: 'header', label: 'Control your voice call from the quick menu' },
          { type: 'note', label: 'Discord only lets apps control your voice if you own the app, so you create your own once. It is free and takes about two minutes.' },
          step(1, 'Open the Discord Developer Portal (button below) in your browser and sign in with your Discord account.'),
          step(2, 'Click New Application, give it any name (for example "PS5 Launcher") and accept the terms.'),
          step(3, 'Open OAuth2 in the menu on the left. Copy the Client ID.'),
          step(4, 'Click Reset Secret, confirm, and copy the Client Secret. It is only shown once.'),
          step(5, 'Under Redirects, click Add Redirect, enter http://localhost and click Save Changes.'),
          step(6, 'In the launcher, open Settings › Users and Accounts › Discord. Enter the Client ID and the Client Secret, then choose Connect to Discord.'),
          step(7, 'Discord shows an Authorize window. Click Authorize. From now on the launcher connects by itself whenever Discord is running.'),
          { type: 'action', icon: 'external', label: 'Open the Discord Developer Portal', run: () => api.openExternal('https://discord.com/developers/applications') },
          { type: 'action', icon: 'party', label: 'Go to Discord Settings', run: go('users', 'Discord') },
        ],
      },
      
     
      {
        label: 'Controller in Games',
        items: () => [
          { type: 'header', label: 'Stop games reacting to the controller while a menu is open' },
          { type: 'note', label: 'Many games keep reading the controller while the quick menu is open. The launcher can give games a virtual controller instead of the real one and silence it while a menu is in front. This needs two free, signed drivers. It works with PlayStation 5 and Xbox controllers.' },
          step(1, 'Install HidHide (button below, take the newest HidHide_x64.exe) and restart the PC if it asks. HidHide hides your real controller from games.'),
          step(2, 'Install VIIPER (button below, take viiper-windows-amd64.exe and choose Install). It brings usbip-win2, the driver the virtual controller needs. The launcher makes the virtual controller itself.'),
          step(3, 'In the launcher, open Settings › System › In-Game Overlay and turn on Block Controller in Games While Menus Are Open. The status line should say 1 controller.'),
          step(4, 'Your DualSense briefly disconnects and reconnects by itself, so programs like Steam that already had it open switch to the virtual one. If a game still reacts to it while a menu is open, turn the controller off and on once.'),
          step(5, 'In games, the controller now works as usual, and the quick menu no longer moves you around in the game. Rumble, adaptive triggers, the lightbar, the player lights, HD haptics and the sound for the controller speaker reach your controller.'),
          { type: 'action', icon: 'external', label: 'Open the HidHide Download Page', run: () => api.openExternal('https://github.com/nefarius/HidHide/releases') },
          { type: 'action', icon: 'external', label: 'Open the VIIPER Download Page', run: () => api.openExternal('https://github.com/Alia5/VIIPER/releases') },
          { type: 'action', icon: 'settings', label: 'Go to Overlay Settings', run: go('system', 'In-Games Overlay') },
        ],
      },
    
    ],
  };
}
