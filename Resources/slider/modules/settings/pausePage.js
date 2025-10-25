import { getConfig } from "../config.js";
import { createCheckbox, createSection } from "../settings.js";

export function createPausePanel(_config, labels) {
  const config = getConfig();
  const sap = Object.assign({
    enabled: true,
    blurMinutes: 0.5,
    hiddenMinutes: 0.2,
    idleMinutes: 45,
    useIdleDetection: true,
    respectPiP: true,
    ignoreShortUnderSec: 300
  }, (config.smartAutoPause || {}));

  const panel = document.createElement('div');
  panel.id = 'pause-panel';
  panel.className = 'settings-panel';

  const section = createSection(labels.pauseSettings || 'Durdurma Ekranı Ayarları');

  const enableCheckbox = createCheckbox(
    'pauseOverlay',
    labels.enablePauseOverlay || 'Durdurma Ekranını Etkinleştir',
    config.pauseOverlay.enabled
  );
  section.appendChild(enableCheckbox);

  const showRequireWebSocket = createCheckbox(
    'pauseOverlayRequireWebSocket',
    labels.requireWebSocket || 'Video Yakalamada Sadece Web Socket Kullan',
    config.pauseOverlay.requireWebSocket !== false
  );
  section.appendChild(showRequireWebSocket);

  const description = document.createElement('div');
  description.className = 'description-text';
  description.textContent = labels.pauseOverlayDescription ||
      'Bu özellik etkinleştirildiğinde, video duraklatıldığında içerik bilgilerini gösteren bir ekran görüntülenir.';
  section.appendChild(description);
  const imagePrefContainer = document.createElement('div');
  imagePrefContainer.className = 'fsetting-item';

  const imagePrefLabel = document.createElement('label');
  imagePrefLabel.textContent = labels.pauseImagePreference || 'Görsel Önceliği';
  imagePrefLabel.htmlFor = 'pauseOverlayImagePreference';
  imagePrefLabel.className = 'settings-label';

  const imagePrefSelect = document.createElement('select');
  imagePrefSelect.name = 'pauseOverlayImagePreference';
  imagePrefSelect.id = 'pauseOverlayImagePreference';
  imagePrefSelect.className = 'settings-select';

  ['auto', 'logo', 'disc', 'title', 'logo-title', 'disc-logo-title', 'disc-title'].forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels['pauseImage_' + value] || value;
    option.selected = config.pauseOverlay.imagePreference === value;
    imagePrefSelect.appendChild(option);
  });

  imagePrefContainer.appendChild(imagePrefLabel);
  imagePrefContainer.appendChild(imagePrefSelect);
  section.appendChild(imagePrefContainer);

  const showPlotCheckbox = createCheckbox(
    'pauseOverlayShowPlot',
    labels.showPlot || 'Konu Açıklamasını Göster',
    config.pauseOverlay.showPlot !== false
  );
  section.appendChild(showPlotCheckbox);

  const showMetadataCheckbox = createCheckbox(
    'pauseOverlayShowMetadata',
    labels.showMetadata || 'Bilgi Satırlarını Göster',
    config.pauseOverlay.showMetadata !== false
  );
  section.appendChild(showMetadataCheckbox);

  const showLogoCheckbox = createCheckbox(
    'pauseOverlayShowLogo',
    labels.showLogo || 'Logo/Disk/Yazı Göster',
    config.pauseOverlay.showLogo !== false
  );
  section.appendChild(showLogoCheckbox);

  const showBackdropCheckbox = createCheckbox(
    'pauseOverlayShowBackdrop',
    labels.showBackdrop || 'Arka Plan Görselini Göster',
    config.pauseOverlay.showBackdrop !== false
  );
  section.appendChild(showBackdropCheckbox);

  const closeOnMouseMoveCheckbox = createCheckbox(
    'pauseOverlayCloseOnMouseMove',
    labels.closeOnMouseMove || 'Fare hareketinde duraklatma ekranını kapat',
    config.pauseOverlay.closeOnMouseMove !== false
  );
  section.appendChild(closeOnMouseMoveCheckbox);

  const minDurRow = addNumberRow({
    name: 'pauseOverlayMinVideoMinutes',
    label: labels.pauseOverlayMinVideoMinutes || 'Minimum video süresi (badge/overlay)',
    value: Math.max(1, Number(config.pauseOverlay?.minVideoMinutes ?? 5) || 5),
    min: 1,
    max: 1000,
    step: 1,
    suffix: labels.dk || 'dk'
});
  section.appendChild(minDurRow);

  const minDurDesc = document.createElement('div');
  minDurDesc.className = 'description-text';
  minDurDesc.textContent =
    labels.pauseOverlayMinVideoMinutesDesc
    || 'Bu değerden kısa (dk) videolarda üst-badge ve duraklatma ekranı gösterilmez.';
  section.appendChild(minDurDesc);

  const ageBadgeHeader = document.createElement('h3');
  ageBadgeHeader.className = 'settings-subheader';
  ageBadgeHeader.textContent = labels.ageBadgeSettings || 'Yaş Rozeti Ayarları';
  section.appendChild(ageBadgeHeader);

  const showAgeBadgeCheckbox = createCheckbox(
    'pauseOverlayShowAgeBadge',
    labels.showAgeBadge || 'Yaş rozetini göster',
    (config.pauseOverlay?.showAgeBadge !== false)
  ) ;
  section.appendChild(showAgeBadgeCheckbox);

  const ageBadgeDurationRow = addNumberRow({
    name: 'ageBadgeDurationSec',
    label: (labels.ageBadgeDurationSec || 'Yaş rozetini gösterme süresi'),
    value: Math.max(1, Math.round((config.pauseOverlay?.ageBadgeDurationMs ?? 12000) / 1000)),
    min: 1,
    max: 3600,
    step: 1,
    suffix: labels.sn || 'sn'
  });
  section.appendChild(ageBadgeDurationRow);

  const ageBadgeLockRow = addNumberRow({
    name: 'ageBadgeLockSec',
    label: (labels.ageBadgeLockSec || 'Yaş rozetini yeniden gösterme kilidi'),
    value: Math.max(0, Math.round((config.pauseOverlay?.ageBadgeLockMs ?? 6000) / 1000)),
    min: 0,
    max: 3600,
    step: 1,
    suffix: labels.sn || 'sn'
  });
  section.appendChild(ageBadgeLockRow);

  const ageBadgeDesc = document.createElement('div');
  ageBadgeDesc.className = 'description-text';
  ageBadgeDesc.textContent =
    (labels.ageBadgeDesc ||
     'Rozet gösterim süresi bitince kaybolur. Kilit süresi boyunca rozet tekrar gösterilmez.');
  section.appendChild(ageBadgeDesc);

  const sapSec = createSection(labels.smartPauseSettings || 'Akıllı Otomatik Duraklatma');
  const sapEnableCheckbox = createCheckbox(
    'sapEnabled',
    labels.smartAutoPauseEnable || 'Akıllı Otomatik Duraklatma Etkin',
    sap.enabled !== false
  );
  sapSec.appendChild(sapEnableCheckbox);

  const sapDesc = document.createElement('div');
  sapDesc.className = 'description-text';
  sapDesc.textContent =
    labels.smartAutoPauseDescription ||
    'Odak kaybı, sekmenin gizlenmesi/minimize ve kullanıcı etkinliği yokluğunda videoyu belirtilen dakikalar sonra durdurur. Ondalıklı değerleri (örn. 0.2 dk) destekler.';
  sapSec.appendChild(sapDesc);

  function addNumberRow({name, label, value, min=0.1, max=1000, step=0.1, suffix=labels.dk})  {
  const wrap = document.createElement('div');
  wrap.className = 'fsetting-item';
  const lab = document.createElement('label');
  lab.textContent = label;
  lab.className = 'settings-label';
  lab.htmlFor = name;
  const inputWrap = document.createElement('div');
  inputWrap.className = 'settings-input';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.name = name;
  inp.id = name;
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = (value ?? '').toString();
  inp.style.width = '110px';
  const suf = document.createElement('span');
  suf.textContent = ' ' + suffix;
  suf.style.marginLeft = '6px';
  inputWrap.appendChild(inp);
  inputWrap.appendChild(suf);
  wrap.appendChild(lab);
  wrap.appendChild(inputWrap);
  return wrap;
}

  sapSec.appendChild(
    addNumberRow({
      name: 'sapBlurMinutes',
      label: labels.smartUnfocusedThreshold || 'Odak dışı bekleme',
      value: sap.blurMinutes
    })
  );

  sapSec.appendChild(
    addNumberRow({
      name: 'sapHiddenMinutes',
      label: labels.smartOffscreenThreshold || 'Sekme gizli/minimize bekleme',
      value: sap.hiddenMinutes
    })
  );

  sapSec.appendChild(
    addNumberRow({
      name: 'sapIdleMinutes',
      label: labels.smartIdleThreshold || 'Etkinlik yok bekleme',
      value: sap.idleMinutes
    })
  );

  const shortWrap = document.createElement('div');
  shortWrap.className = 'fsetting-item';
  const shortLab = document.createElement('label');
  shortLab.textContent = labels.sapIgnoreShortUnderSec || 'Kısa videolarda devre dışı (saniye altı)';
  shortLab.className = 'settings-label';
  shortLab.htmlFor = 'sapIgnoreShortUnderSec';
  const shortInputWrap = document.createElement('div');
  shortInputWrap.className = 'settings-input';
  const shortInp = document.createElement('input');
  shortInp.type = 'number';
  shortInp.name = 'sapIgnoreShortUnderSec';
  shortInp.id = 'sapIgnoreShortUnderSec';
  shortInp.min = '0';
  shortInp.step = '1';
  shortInp.value = (sap.ignoreShortUnderSec ?? 300).toString();
  shortInp.style.width = '110px';
  const shortSuf = document.createElement('span');
  shortSuf.textContent =  labels.sn;
  shortSuf.style.marginLeft = '6px';
  shortInputWrap.appendChild(shortInp);
  shortInputWrap.appendChild(shortSuf);
  shortWrap.appendChild(shortLab);
  shortWrap.appendChild(shortInputWrap);
  sapSec.appendChild(shortWrap);

  const sapIdleDetectCheckbox = createCheckbox(
    'sapUseIdleDetection',
    labels.smartUseIdleDetection || 'Kullanıcı etkinliği (idle) algılamasını kullan',
    sap.useIdleDetection !== false
  );
  sapSec.appendChild(sapIdleDetectCheckbox);
  const sapRespectPiPCheckbox = createCheckbox(
    'sapRespectPiP',
    labels.smartRespectPiP || 'Picture-in-Picture (PiP) açıkken durdurma',
    sap.respectPiP !== false
  );
  sapSec.appendChild(sapRespectPiPCheckbox);

  panel.appendChild(section);
  panel.appendChild(sapSec);

  return panel;
}
