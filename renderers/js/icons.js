// All application-drawn UI icons come from the locally installed Lucide package.
const GalleryIcons = (() => {
  const library = window.lucide;
  function create(name, className = '') {
    const icon = library.createElement(library[name], { class: 'lucide-icon ' + className, 'aria-hidden': 'true', focusable: 'false', 'stroke-width': 1.8 });
    icon.dataset.lucide = name;
    return icon;
  }
  for (const placeholder of document.querySelectorAll('[data-icon]')) {
    const icon = create(placeholder.dataset.icon, placeholder.className);
    for (const attribute of placeholder.attributes) {
      if (!['data-icon', 'class'].includes(attribute.name)) icon.setAttribute(attribute.name, attribute.value);
    }
    placeholder.replaceWith(icon);
  }
  return { create };
})();
