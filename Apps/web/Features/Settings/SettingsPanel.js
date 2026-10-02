import { NUMERIC_SETTINGS, QUALITY_CHOICES, DEBUG_VIEWS } from '../../../../Shared/Domain/Entities/Settings.js';
import { SOLVERS } from '../../Engine/Solvers.js';

const VIEW_LABELS = {
  final: 'Final',
  photo: 'Photo without fog',
  depth: 'Depth map',
  fogDensity: 'Fog density',
  velocity: 'Velocity',
  solids: 'Solids',
};

const QUALITY_LABELS = { low: 'Low', medium: 'Med', high: 'High' };

const STATS_REFRESH_MILLISECONDS = 500;

const PANEL_STATES = {
  hidden: 'hidden',
  compact: 'compact',
  expanded: 'expanded',
};

export class SettingsPanel {
  #settings;
  #engine;
  #root;
  #stats;
  #restoreButton;
  #settingsButton;
  #solverDescription;
  #state = PANEL_STATES.compact;

  constructor({ settings, engine }) {
    this.#settings = settings;
    this.#engine = engine;
  }

  mount(parent) {
    this.#root = element('div', { className: 'panel' });
    this.#restoreButton = button('', 'Show the menu', () => this.#enterState(PANEL_STATES.compact), 'restore');
    this.#settingsButton = button('⚙', 'Settings', () => this.#settingsButtonTapped(), 'icon');
    const hideButton = button('–', 'Hide the menu', () => this.#enterState(PANEL_STATES.hidden), 'icon');
    this.#stats = element('div', { className: 'stats' });
    this.#solverDescription = element('div', { className: 'hint' });
    const topRow = element('div', { className: 'top-row' }, [
      this.#select('solver', 'Algorithm', SOLVERS.map((solver) => [solver.id, solver.label])),
      this.#select('quality', 'Quality', QUALITY_CHOICES.map((choice) => [choice, QUALITY_LABELS[choice]])),
      this.#settingsButton,
      hideButton,
    ]);
    const body = element('div', { className: 'body' }, [
      this.#solverDescription,
      element('label', { htmlFor: 'setting-view' }, ['View', this.#select('view', 'View', DEBUG_VIEWS.map((view) => [view, VIEW_LABELS[view]]))]),
      ...this.#sliderGroups(),
      this.#buttons(),
    ]);
    this.#root.append(this.#restoreButton, topRow, this.#stats, body);
    parent.append(this.#root);
    this.#enterState(PANEL_STATES.compact);
    this.#showSolverDescription();
    this.#settings.subscribe((key) => { if (key === 'solver') this.#showSolverDescription(); });
    setInterval(() => this.#showStats(), STATS_REFRESH_MILLISECONDS);
  }

  #settingsButtonTapped() {
    this.#enterState(this.#state === PANEL_STATES.expanded ? PANEL_STATES.compact : PANEL_STATES.expanded);
  }

  #enterState(state) {
    this.#state = state;
    this.#root.dataset.state = state;
    this.#settingsButton.setAttribute('aria-expanded', String(state === PANEL_STATES.expanded));
  }

  #select(key, accessibleName, options) {
    const select = element('select', { id: `setting-${key}`, title: accessibleName });
    select.setAttribute('aria-label', accessibleName);
    for (const [value, text] of options) select.append(element('option', { value, textContent: text }));
    select.value = this.#settings.values[key];
    select.addEventListener('change', () => this.#settings.change(key, select.value));
    return select;
  }

  #sliderGroups() {
    const groups = [...new Set(NUMERIC_SETTINGS.map((spec) => spec.group))];
    return groups.map((group) => element('details', { open: group === 'Fog' }, [
      element('summary', { textContent: group }),
      ...NUMERIC_SETTINGS.filter((spec) => spec.group === group).map((spec) => this.#slider(spec)),
    ]));
  }

  #slider({ key, label, min, max, step }) {
    const valueText = element('span', { className: 'value', textContent: String(this.#settings.values[key]) });
    const input = element('input', { id: `setting-${key}`, type: 'range', min, max, step, value: this.#settings.values[key] });
    input.addEventListener('input', () => {
      this.#settings.change(key, Number(input.value));
      valueText.textContent = input.value;
    });
    return element('label', { className: 'slider', htmlFor: input.id }, [element('span', { textContent: label }), valueText, input]);
  }

  #buttons() {
    return element('div', { className: 'buttons' }, [
      button('Reset fog', 'Reset fog', () => this.#engine.resetFogRequested()),
      button('Next scene', 'Next scene', () => this.#engine.nextSceneRequested()),
    ]);
  }

  #showSolverDescription() {
    this.#solverDescription.textContent = SOLVERS.find((solver) => solver.id === this.#settings.values.solver).description;
  }

  #showStats() {
    const stats = this.#engine.stats;
    const gpuText = stats.gpuMilliseconds === null ? '' : ` · GPU ${stats.gpuMilliseconds.toFixed(1)} ms`;
    const gridText = stats.gridSize ? ` · ${stats.preset} ${stats.gridSize.join('×')}` : '';
    const particleText = stats.particleCount > 0 ? ` · ${(stats.particleCount / 1e6).toFixed(2)}M particles` : '';
    this.#stats.textContent = `${stats.framesPerSecond.toFixed(0)} fps${gpuText}${gridText}${particleText}`;
    this.#restoreButton.textContent = `${stats.framesPerSecond.toFixed(0)} fps ⚙`;
  }
}

function element(tag, properties = {}, children = []) {
  const created = document.createElement(tag);
  Object.assign(created, properties);
  for (const child of children) created.append(child);
  return created;
}

function button(text, accessibleName, onTap, className = '') {
  const created = element('button', { textContent: text, type: 'button', className, title: accessibleName });
  created.setAttribute('aria-label', accessibleName);
  created.addEventListener('click', onTap);
  return created;
}
