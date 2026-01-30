export const createButton = (label, variant = '') => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = `data-app-button${variant ? ` ${variant}` : ''}`;
  return button;
};

const getIconSvg = (name) => {
  switch (name) {
    case 'plus':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>';
    case 'refresh':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1.4 3.6" /><path d="M13 3v4h-4" /></svg>';
    case 'play':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><polygon points="6,4 12,8 6,12" class="data-app-icon-fill" /></svg>';
    case 'edit':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M3 11.5V13h1.5l7-7-1.5-1.5-7 7z" /><path d="M10.5 3.5l1.5 1.5" /></svg>';
    case 'trash':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M3 5h10" /><path d="M6 5v7" /><path d="M10 5v7" /><path d="M5 5l1-2h4l1 2" /></svg>';
    case 'load':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M8 3v6" /><path d="M5 7l3 3 3-3" /><path d="M3 13h10" /></svg>';
    case 'close':
      return '<svg viewBox="0 0 16 16" class="data-app-icon" aria-hidden="true"><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></svg>';
    default:
      return '';
  }
};

export const createIconButton = (icon, label, variant = '') => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `data-app-icon-button${variant ? ` ${variant}` : ''}`;
  if (label) {
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  button.innerHTML = getIconSvg(icon);
  return button;
};

export const createField = (labelText, inputEl) => {
  const field = document.createElement('label');
  field.className = 'data-app-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  label.className = 'data-app-field-label';
  field.appendChild(label);
  field.appendChild(inputEl);
  return field;
};

export const createFilePicker = (inputEl, options = {}) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'data-app-file-picker';
  const button = createButton(options.buttonText || '选择文件', 'ghost');
  button.classList.add('data-app-file-button');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'data-app-file-input';
  if (options.accept) fileInput.accept = options.accept;
  button.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const path = file.path || file.name || '';
    if (path) {
      inputEl.value = path;
    }
    fileInput.value = '';
  });
  wrapper.appendChild(inputEl);
  wrapper.appendChild(button);
  wrapper.appendChild(fileInput);
  return wrapper;
};
