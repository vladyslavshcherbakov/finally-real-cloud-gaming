import { ParamsBuffer } from './ParamsBuffer.js';
import { DEBUG_VIEWS } from '../../../../Shared/Domain/Entities/Settings.js';

export class ShaderLoadFailed extends Error {
  constructor(name, status) {
    super(`shader ${name} could not be loaded: HTTP ${status}`);
    this.name = 'ShaderLoadFailed';
  }
}

const INCLUDE_LINE = /^\/\/#include (\w+)\s*$/m;
const SHARED_SHADER = 'common';

export class ShaderLibrary {
  #sourcesByName;

  constructor(sourcesByName) {
    this.#sourcesByName = sourcesByName;
  }

  static async load(names) {
    const sourcesByName = new Map();
    let missingNames = [...new Set([SHARED_SHADER, ...names])];
    while (missingNames.length > 0) {
      const sources = await Promise.all(missingNames.map(fetchShader));
      missingNames.forEach((name, i) => sourcesByName.set(name, sources[i]));
      const includes = sources.flatMap(includedNames);
      missingNames = [...new Set(includes)].filter((name) => !sourcesByName.has(name));
    }
    return new ShaderLibrary(sourcesByName);
  }

  moduleCode(name, declarations) {
    return [
      ParamsBuffer.wgslDeclarations(),
      debugViewConstants(),
      declarations,
      this.#expanded(SHARED_SHADER),
      this.#expanded(name),
    ].join('\n');
  }

  #expanded(name) {
    const parts = this.#sourcesByName.get(name).split(INCLUDE_LINE);
    for (let i = 1; i < parts.length; i += 2) parts[i] = this.#expanded(parts[i]);
    return parts.join('\n');
  }
}

async function fetchShader(name) {
  const response = await fetch(new URL(`../Shaders/${name}.wgsl`, import.meta.url));
  if (!response.ok) throw new ShaderLoadFailed(name, response.status);
  return response.text();
}

function includedNames(source) {
  return [...source.matchAll(new RegExp(INCLUDE_LINE.source, 'gm'))].map((match) => match[1]);
}

function debugViewConstants() {
  return DEBUG_VIEWS.map((view, i) => `const DEBUG_VIEW_${screamingCase(view)} = ${i};`).join('\n');
}

function screamingCase(camelCaseName) {
  return camelCaseName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}
