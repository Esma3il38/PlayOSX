// Start-up, PS5 style: the spotlight stage fades in from black, "Welcome Back"
// and the user row build in over drifting particles. Choosing a user clears
// the scene and the home screen assembles itself (HomeView.playBootIntro).

import { h, sleep } from '../util.js';
import { api, on, emit, state } from '../state.js';
import { sfx, unlockAudio } from '../sound.js';
import { avatarHtml, AVATARS } from '../ui/avatar.js';
import { glyph } from '../ui/glyphs.js';
import { icon } from '../icons.js';
import { mouseActive } from '../input.js';
import { BootStage } from '../ui/bootstage.js';
import { optionsMenu, confirmDialog, textDialog } from '../ui/dialogs.js';
import { isAdmin, profiles, activeProfileId, useProfile, addProfile, updateProfile, removeProfile, pickProfileImage } from '../profiles.js';
import { t } from '../i18n.js';
import { unlockProfile } from '../pro.js';

const STEP = 35.2; // rem between avatar centres

/**
 * @param {{ welcome: boolean, setHandler: Function, intro: (stage: BootStage) => Promise<void> }} o
 *   intro plays the home screen's build-in; it resolves once the home screen
 *   can take input.
 */
async function powerOnLogo(stage) {
  const el = h('div', { class: 'boot-logo' }, h('div', { class: 'bl-mark', html: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z"/></svg>' }));
  stage.el.append(el);
  sfx.boot();
  await sleep(6900);
  el.remove();
}

export async function runBoot({ welcome, setHandler, intro }) {
  const stage = new BootStage().mount();
  document.getElementById('boot-cover')?.remove();
  if (state.settings.bootLogo !== false) await powerOnLogo(stage);
  else sfx.boot();
  setHandler(() => {});
  if (!welcome) {
    stage.dimParticles();
    await sleep(700);
    await intro(stage);
    return;
  }
  await new Welcome(stage, setHandler).run();
  await intro(stage);
}

class Welcome {
  constructor(stage, setHandler) {
    this.stage = stage;
    this.setHandler = setHandler;
    this.zone = 'row'; // 'row' | 'power'
    this.busy = false;
  }

  run() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.el = h(
        'div',
        { class: 'welcome' },
        h('div', { class: 'ws-clock', dataset: { clock: '' } }),
        h('div', { class: 'ws-title', text: t('Welcome Back') }),
        h('div', { class: 'ws-sub', text: t("Who's using this controller?") }),
        (this.rowEl = h('div', { class: 'ws-row' })),
        (this.powerBtn = h('button', { class: 'ws-power fx', html: icon('power'), title: t('Power'), onclick: () => this.focusPower(true) && this.powerMenu() })),
        h('div', { class: 'ws-select', html: `<span data-glyph="confirm">${glyph('confirm')}</span><span>${t('Select')}</span>` })
      );
      this.powerBtn.addEventListener('mouseenter', () => mouseActive() && this.focusPower());
      this.stage.el.append(this.el);
      emit('clock');
      this.items = this.buildItems();
      this.sel = Math.max(0, this.items.findIndex((it) => it.profile && it.profile.id === activeProfileId()));
      this.render(true);
      this.offSettings = on('settings', () => {
        if (this.leaving) return;
        const key = this.items[this.sel] && this.items[this.sel].key;
        this.items = this.buildItems();
        const i = this.items.findIndex((it) => it.key === key);
        if (i >= 0) this.sel = i;
        this.render(false);
      });
      this.setHandler((action) => this.handle(action));
      // Build-in: title, then the avatars, then everything else. Input waits
      // until the row is in place.
      this.busy = true;
      void this.el.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('in')));
      setTimeout(() => this.el.classList.add('ready'), 1000);
      setTimeout(() => (this.busy = false), 1300);
    });
  }

  buildItems() {
    return [{ key: '__add', type: 'add' }, ...profiles().map((p) => ({ key: p.id, type: 'user', profile: p }))];
  }

  render(first) {
    const keep = new Map((this.itemEls || []).map((el) => [el._key, el]));
    this.itemEls = this.items.map((it, i) => {
      let el = keep.get(it.key);
      const sig = it.profile ? `${it.profile.name}|${it.profile.avatar}|${it.profile.image}` : 'add';
      if (!el || el._sig !== sig) {
        if (el) el.remove();
        const av = h('button', {
          class: 'ws-av fx',
          html: it.type === 'add' ? `<div class="ws-plus">${icon('plus')}</div>` : avatarHtml('ws-avatar', it.profile),
        });
        el = h(
          'div',
          { class: `ws-item ws-${it.type}` },
          h('div', { class: 'ws-pad', html: `<span>1</span>${icon('gamepad')}` }),
          av,
          it.type === 'user' ? h('div', { class: 'ws-opt', html: `${icon('gamepad')}<span>${t('Options')}</span>` }) : null,
          h('div', { class: 'ws-name', text: it.type === 'add' ? t('Add User') : it.profile.name })
        );
        el._key = it.key;
        el._sig = sig;
        av.addEventListener('click', () => {
          const idx = this.items.findIndex((x) => x.key === el._key);
          if (idx === this.sel && this.zone === 'row') this.choose();
          else {
            this.zone = 'row';
            this.select(idx);
          }
        });
        this.rowEl.append(el);
      }
      el.style.setProperty('--i', i);
      return el;
    });
    for (const [key, el] of keep) if (!this.items.some((it) => it.key === key)) el.remove();
    this.layout(first);
  }

  layout() {
    this.itemEls.forEach((el, i) => {
      el.style.setProperty('--x', `${(i - this.sel) * STEP}rem`);
      el.classList.toggle('sel', i === this.sel);
      el.querySelector('.ws-av').classList.toggle('focused', i === this.sel && this.zone === 'row');
    });
    this.powerBtn.classList.toggle('focused', this.zone === 'power');
  }

  select(i) {
    if (i < 0 || i >= this.items.length) {
      sfx.bump();
      return;
    }
    if (i !== this.sel) sfx.move();
    this.sel = i;
    this.layout();
  }

  focusPower(silent = false) {
    if (this.zone === 'power') return true;
    this.zone = 'power';
    if (!silent) sfx.move();
    this.layout();
    return true;
  }

  handle(action) {
    if (this.busy) return;
    unlockAudio();
    if (this.zone === 'power') {
      if (action === 'up' || action === 'back') {
        this.zone = 'row';
        sfx.move();
        this.layout();
      } else if (action === 'confirm') this.powerMenu();
      else sfx.bump();
      return;
    }
    if (action === 'left') this.select(this.sel - 1);
    else if (action === 'right') this.select(this.sel + 1);
    else if (action === 'down') this.focusPower();
    else if (action === 'confirm') this.choose();
  }

  async choose() {
    const it = this.items[this.sel];
    if (!it || this.busy) return;
    if (it.type === 'add') {
      sfx.select();
      this.busy = true;
      const name = await textDialog({ title: 'Add User', placeholder: 'Name', okLabel: 'Add' });
      this.busy = false;
      if (name && name.trim()) {
        const p = await addProfile(name.trim());
        this.items = this.buildItems();
        this.sel = this.items.findIndex((x) => x.key === p.id);
        this.render(false);
      }
      return;
    }
    this.busy = true;
    sfx.select();
    if (!(await unlockProfile(it.profile.id, true))) {
      this.busy = false;
      return;
    }
    this.leaving = true;
    if (it.profile.id !== activeProfileId()) await useProfile(it.profile.id);
    this.offSettings();
    await this.leave();
    this.resolve();
  }

  async options() {
    const it = this.items[this.sel];
    if (!it || it.type !== 'user' || this.busy) return;
    sfx.select();
    this.busy = true;
    const p = it.profile;
    const anchor = this.itemEls[this.sel].querySelector('.ws-av');
    await optionsMenu({
      title: p.name,
      anchor,
      items: [
        {
          label: 'Change Name…',
          icon: 'edit',
          run: async () => {
            const name = await textDialog({ title: 'Profile Name', value: p.name });
            if (name && name.trim()) await updateProfile(p.id, { name: name.trim() });
          },
        },
        { label: 'Choose Picture…', icon: 'image', run: () => pickProfileImage(p.id) },
        p.image ? { label: 'Remove Picture', icon: 'close', run: () => (api.removeProfileImage(p.image).catch(() => {}), updateProfile(p.id, { image: null })) } : null,
        { label: 'Change Color', icon: 'sliders', run: () => updateProfile(p.id, { avatar: ((p.avatar || 0) + 1) % AVATARS.length }) },
        profiles().length > 1 && isAdmin() && !isAdmin(p.id)
          ? {
              label: 'Delete User',
              icon: 'trash',
              danger: true,
              run: async () => {
                if (await confirmDialog({ title: t('Delete {name}?', { name: p.name }), message: 'The user and all of their games, settings and music are deleted.', confirmLabel: 'Delete', danger: true })) {
                  await removeProfile(p.id);
                }
              },
            }
          : null,
      ].filter(Boolean),
    });
    this.busy = false;
  }

  async powerMenu() {
    if (this.busy) return;
    sfx.select();
    this.busy = true;
    const ask = (title, message, label, fn) => async () => {
      if (await confirmDialog({ title, message, confirmLabel: label, danger: true })) fn();
    };
    await optionsMenu({
      title: 'Power',
      anchor: this.powerBtn,
      side: 'above',
      items: [
        { label: 'Exit Launcher', icon: 'exit', run: ask('Exit the launcher?', '', 'Exit', () => api.windowAction('close')) },
        { label: 'Minimize Launcher', icon: 'minimize', run: () => api.windowAction('minimize') },
        { label: 'Sleep', icon: 'moon', run: ask('Put the PC to sleep?', '', 'Sleep', () => api.power('sleep')) },
        { label: 'Restart PC', icon: 'restart', run: ask('Restart the PC?', 'Unsaved work in other apps will be lost.', 'Restart', () => api.power('restart')) },
        { label: 'Turn Off PC', icon: 'power', danger: true, run: ask('Turn off the PC?', 'Unsaved work in other apps will be lost.', 'Turn Off', () => api.power('shutdown')) },
      ],
    });
    this.busy = false;
  }

  /** The other users and the text go first, then the chosen avatar, then the particles. */
  async leave() {
    this.el.classList.add('chosen');
    await sleep(140);
    this.el.classList.add('out');
    await sleep(320);
    this.stage.dimParticles();
    await sleep(380);
    this.el.remove();
  }
}
