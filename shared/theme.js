(function (root) {
  const presets = [
    { name: '纯黑', color: '#000000' },
    { name: '石墨灰', color: '#1c1f24' },
    { name: '深海蓝', color: '#132033' },
    { name: '松林绿', color: '#17271f' },
    { name: '烟紫', color: '#281e30' },
    { name: '白色', color: '#ffffff' }
  ];
  const channels = color => color.slice(1).match(/../g).map(part => parseInt(part, 16));
  function mix(base, target, amount) {
    const end = channels(target);
    return '#' + channels(base).map((value, index) => Math.round(value * (1 - amount) + end[index] * amount).toString(16).padStart(2, '0')).join('');
  }
  function getPalette(value) {
    const background = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000';
    const rgb = channels(background);
    const text = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 160 ? '#202020' : '#eeeeee';
    const surface = mix(background, text, 0.08);
    return {
      background, text, surface,
      hover: mix(background, text, 0.15),
      muted: mix(background, text, 0.72),
      accent: mix(background, '#c2d4ff', 0.7),
      sidebar: background,
      focus: `rgba(${rgb.join(', ')}, 0.88)`,
      controls: `rgba(${channels(surface).join(', ')}, 0.85)`
    };
  }
  const theme = { presets, getPalette };
  if (typeof module !== 'undefined' && module.exports) module.exports = theme;
  else root.GalleryTheme = theme;
})(globalThis);
