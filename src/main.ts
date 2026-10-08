import './style.css';
import { sfx } from './audio/sfx';
import { isKind } from './core/registry';
import { loadSettings } from './settings';
import { startRouter, type Screen } from './ui/router';
import { homeScreen } from './ui/screens/home';
import { npcSetupScreen } from './ui/screens/npcSetup';
import { onlineScreen } from './ui/screens/online';
import { roomScreen } from './ui/screens/room';
import { selectScreen } from './ui/screens/select';
import { settingsScreen } from './ui/screens/settings';
import { soloScreen } from './ui/screens/solo';
import { tutorialScreen } from './ui/screens/tutorial';
import { versusNpcScreen } from './ui/screens/versusNpc';

sfx.setVolume(loadSettings().volume);

const levels = ['easy', 'normal', 'hard', 'oni'];
const home = (): Screen => homeScreen();
/** URL の値がおかしいときはホームに戻す */
const guard = (ok: (p: Record<string, string>) => boolean, f: (p: Record<string, string>) => Screen) =>
  (p: Record<string, string>) => (ok(p) ? f(p) : (location.hash = '#/home', home()));

startRouter(document.querySelector<HTMLElement>('#app')!, {
  '/home': home,
  '/select/:next': guard(p => p.next === 'solo' || p.next === 'tutorial', selectScreen),
  '/solo/:kind': guard(p => isKind(p.kind), soloScreen),
  '/tutorial/:kind': guard(p => isKind(p.kind), tutorialScreen),
  '/npc': npcSetupScreen,
  '/versus/npc/:me/:opp/:level': guard(p => isKind(p.me) && isKind(p.opp) && levels.includes(p.level), versusNpcScreen),
  '/online': onlineScreen,
  '/room/:id': guard(p => /^[A-Za-z0-9]{6}$/.test(p.id), roomScreen),
  '/settings': settingsScreen,
});
