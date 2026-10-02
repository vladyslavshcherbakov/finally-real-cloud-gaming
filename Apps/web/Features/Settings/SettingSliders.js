export const SLIDER_GROUPS = [
  {
    title: 'Fog',
    isOpenAtStart: true,
    sliders: [
      { key: 'fogThickness', label: 'Thickness', step: 0.5 },
      { key: 'baseSmog', label: 'Base smog', step: 0.01 },
      { key: 'clumps', label: 'Clumps', step: 0.01 },
      { key: 'heightFalloff', label: 'Height falloff (m)', step: 1 },
      { key: 'returnRate', label: 'Return speed', step: 0.005 },
      { key: 'diffusion', label: 'Creep in', step: 0.01 },
    ],
  },
  {
    title: 'Wind',
    isOpenAtStart: false,
    sliders: [
      { key: 'windStrength', label: 'Strength', step: 0.05 },
      { key: 'windRadius', label: 'Radius', step: 0.005 },
      { key: 'wakeMixing', label: 'Mixing', step: 0.05 },
      { key: 'turbulence', label: 'Turbulence (m/s)', step: 0.05 },
      { key: 'drift', label: 'Drift (m/s)', step: 0.05 },
      { key: 'vorticity', label: 'Vorticity', step: 0.05 },
      { key: 'damping', label: 'Damping', step: 0.01 },
    ],
  },
  {
    title: 'Look',
    isOpenAtStart: false,
    sliders: [
      { key: 'detail', label: 'Detail', step: 0.01 },
      { key: 'detailScale', label: 'Detail scale (1/m)', step: 0.01 },
      { key: 'erosion', label: 'Erosion', step: 0.01 },
      { key: 'detailFlowPeriod', label: 'Detail flow period (s)', step: 0.5 },
      { key: 'sun', label: 'Sun', step: 0.05 },
      { key: 'ambient', label: 'Ambient', step: 0.05 },
      { key: 'sceneGlow', label: 'Scene glow', step: 0.01 },
      { key: 'forwardScattering', label: 'Forward scattering', step: 0.01 },
      { key: 'multipleScattering', label: 'Multiple scattering', step: 0.01 },
      { key: 'exposure', label: 'Exposure', step: 0.01 },
    ],
  },
];
