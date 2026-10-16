(function () {
  'use strict';
  const E = window.JX3Engine;
  const data = window.JX3_DATA || { meta: {}, specs: [] };
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const roleLabel = role => ({ dps: '输出', healer: '治疗', tank: '坦克' }[role] || role || '');
  const roundName = value => ({ 1: '首轮', 2: '二轮', 3: '三轮' }[value] || (value ? String(value) : '官方'));
  const safeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; } };
  const sourceLink = (url, label) => safeUrl(url) ? `<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label || '官方原文')} ↗</a>` : '';
  let browserStorage;
  try { browserStorage = window.localStorage; } catch (_) { browserStorage = { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } }; }
  const storage = E.createStorage(browserStorage);
  const loaded = storage.load();
  const state = { specId: '', drafts: {}, saved: [], school: '', group: null, anchorKey: '', query: '', namingId: '', deletingId: '' };
  state.saved = loaded.value.saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.plan);
  let obsoleteDrafts = 0;
  for (const [id, value] of Object.entries(loaded.value.drafts)) {
    const result = E.validatePlan(data, value);
    if (result.ok && result.plan.specId === id) state.drafts[id] = result.plan;
    else obsoleteDrafts++;
  }
  state.specId = E.getSpec(data, loaded.value.currentSpecId) ? loaded.value.currentSpecId : (data.specs[0] && data.specs[0].id || '');
  const spec = () => E.getSpec(data, state.specId);
  const plan = () => state.drafts[state.specId] || (state.drafts[state.specId] = E.emptyPlan(spec()));
  let toastTimer, tooltipTimer;
  function toast(message, error) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = `toast${error ? ' error' : ''}`; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 7500 : 4600);
  }
  function warn(message) { $('storage-warning').textContent = message || ''; $('storage-warning').hidden = !message; }
  function persist() {
    const result = storage.write({ schemaVersion: 1, currentSpecId: state.specId, drafts: state.drafts, saved: state.saved });
    warn(result.ok ? '' : result.error); return result.ok;
  }
  function isSelected(talent) {
    const found = E.findTalent(spec(), talent.id);
    return found.area === 'pool' ? plan().poolSelections.includes(talent.id) : plan().tierSelections[String(found.tier.index)] === talent.id;
  }
  function highlighted(text) {
    const value = String(text || ''); if (!state.query) return esc(value);
    const needle = state.query.toLocaleLowerCase(), lower = value.toLocaleLowerCase(); let from = 0, result = '', index;
    while ((index = lower.indexOf(needle, from)) !== -1) { result += esc(value.slice(from, index)) + '<mark>' + esc(value.slice(index, index + needle.length)) + '</mark>'; from = index + needle.length; }
    return result + esc(value.slice(from));
  }
  function matches(talent) {
    return !state.query || [talent.name, talent.description, ...(talent.aliases || []), ...(talent.requiresCore || []), ...(talent.requiresTalents || []), ...(talent.adjustments || []).map(item => item.text)].join(' ').toLocaleLowerCase().includes(state.query.toLocaleLowerCase());
  }
  function renderSelectors() {
    const schools = [...new Set(data.specs.map(item => item.school))];
    $('school-filter').innerHTML = '<option value="">全部</option>' + schools.map(school => `<option value="${esc(school)}">${esc(school)}</option>`).join('');
    $('school-filter').value = state.school;
    const available = data.specs.filter(item => !state.school || item.school === state.school);
    const groups = new Map(); available.forEach(item => { if (!groups.has(item.school)) groups.set(item.school, []); groups.get(item.school).push(item); });
    $('spec-select').innerHTML = [...groups.entries()].map(([school, specs]) => `<optgroup label="${esc(school)}">${specs.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</optgroup>`).join('');
    $('spec-select').value = state.specId;
    $('spec-role').textContent = spec() ? roleLabel(spec().role) : '';
  }
  function slot(talent, key, group, label, classes) {
    const active = state.group !== null && state.anchorKey === key;
    return `<button class="slot ${classes || ''}${talent ? ' selected' : ''}" data-slot-key="${esc(key)}" data-group="${esc(group)}"${talent ? ` data-talent="${esc(talent.id)}"` : ''} aria-expanded="${active}" aria-controls="candidate-menu" aria-label="${esc(label + '：' + (talent ? talent.name : '未选择') + '，点击选择')}"><span class="slot-label">${esc(label)}</span><span class="slot-symbol" aria-hidden="true">${talent ? esc(talent.name.slice(0, 1)) : '＋'}</span><span class="slot-name">${talent ? esc(talent.name) : '未选择'}</span>${talent ? '<span class="slot-check" aria-hidden="true">✓</span>' : ''}</button>`;
  }
  function renderSlots() {
    const current = spec();
    if (!current) {
      $('empty-note').hidden = false; ['save-plan', 'copy-plan', 'export-plan', 'clear-plan'].forEach(id => { $(id).disabled = true; }); return;
    }
    const currentPlan = plan();
    $('slot-strip').innerHTML = current.tiers.map((tier, index) => slot(tier.choices.find(item => item.id === currentPlan.tierSelections[String(tier.index)]), `tier-${tier.index}`, String(tier.index), index === 0 ? '核心' : String(tier.index), index === 0 ? 'core' : '')).join('') + [0, 1, 2].map(index => {
      const found = E.findTalent(current, currentPlan.poolSelections[index]);
      return slot(found && found.talent, `pool-${index}`, 'pool', `混选 ${index + 1}`, `pool${index === 0 ? ' pool-start' : ''}`);
    }).join('');
    const progress = E.progress(current, currentPlan);
    $('progress-label').textContent = `${progress.selected} / ${progress.total}${progress.complete ? ' · 已配齐' : ''}`;
    $('progress-label').className = `progress-label${progress.complete ? ' complete' : ''}`;
    $('clear-plan').disabled = !progress.selected;
    const warnings = current.dataWarnings || [];
    $('data-warnings').hidden = !warnings.length;
    $('data-warning-content').innerHTML = warnings.map(item => `<p>${esc(typeof item === 'string' ? item : item.message || item.text || '')}${typeof item === 'object' ? ' ' + sourceLink(item.sourceUrl, '查看原文') : ''}</p>`).join('');
  }
  function anchorElement() { return [...document.querySelectorAll('[data-slot-key]')].find(item => item.dataset.slotKey === state.anchorKey); }
  function positionMenu() {
    if (state.group === null) return;
    const anchor = anchorElement(); if (!anchor) return;
    const rect = anchor.getBoundingClientRect(), menu = $('candidate-menu');
    const left = Math.max(12, Math.min(rect.left - 3, innerWidth - menu.offsetWidth - 12));
    const below = rect.bottom + 9;
    let top = below;
    if (below + menu.offsetHeight > innerHeight - 12 && rect.top - menu.offsetHeight - 9 >= 12) top = rect.top - menu.offsetHeight - 9;
    else top = Math.min(below, Math.max(12, innerHeight - menu.offsetHeight - 12));
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  }
  function renderCandidates() {
    if (state.group === null || !spec()) return;
    const pool = state.group === 'pool';
    const tier = pool ? null : spec().tiers.find(item => String(item.index) === state.group);
    const all = pool ? spec().pool : tier.choices;
    $('candidate-menu').className = `candidate-menu${pool ? ' pool-menu' : ''}`;
    $('candidate-title').textContent = pool ? '混选奇穴' : tier === spec().tiers[0] ? '核心奇穴' : `第 ${tier.index} 层`;
    $('candidate-count').textContent = pool ? `已选 ${plan().poolSelections.length} / 3` : `${all.length} 选 1`;
    $('candidate-list').innerHTML = all.filter(matches).map(talent => {
      const selected = isSelected(talent), available = E.availability(spec(), plan(), talent);
      const required = [...(talent.requiresCore || []), ...(talent.requiresTalents || [])];
      return `<article class="candidate${selected ? ' selected' : ''}${!available.allowed ? ' locked' : ''}" data-talent="${esc(talent.id)}"><button class="candidate-main" data-select="${esc(talent.id)}" aria-pressed="${selected}" aria-disabled="${!available.allowed}" aria-label="${esc(talent.name + (selected ? '，已选，点击取消' : !available.allowed ? '，' + available.reason : '，点击选择'))}"><span class="candidate-glyph" aria-hidden="true">${esc(talent.name.slice(0, 1))}</span><span class="candidate-text"><span class="candidate-name">${highlighted(talent.name)}</span>${required.length ? `<span class="candidate-requirement">${available.allowed ? '' : '◇ '}${esc(required.join(' / '))}</span>` : ''}</span></button><button class="candidate-info" data-detail="${esc(talent.id)}" aria-label="查看${esc(talent.name)}说明">ⓘ</button>${selected ? '<span class="candidate-selected" aria-hidden="true">✓</span>' : ''}</article>`;
    }).join('') || '<div class="no-match">没有匹配的奇穴</div>';
    $('candidate-note').textContent = pool ? '点击已选项可取消；选满 3 个后，新增前需先取消一个。' : '选中后收起；悬停或点击 ⓘ 查看完整说明。';
    positionMenu();
  }
  function openMenu(group, key, keyboard) {
    if (state.group === group && state.anchorKey === key) { closeMenu(); return; }
    hideTooltip(); state.group = group; state.anchorKey = key; state.query = ''; $('talent-search').value = '';
    $('candidate-menu').hidden = false; renderSlots(); renderCandidates();
    if (keyboard) { const first = $('candidate-list').querySelector('.candidate-main'); if (first) first.focus(); }
  }
  function closeMenu(restoreFocus) {
    const anchor = anchorElement(); state.group = null; $('candidate-menu').hidden = true; hideTooltip(); renderSlots();
    if (restoreFocus && anchor) { const replacement = [...document.querySelectorAll('[data-slot-key]')].find(item => item.dataset.slotKey === anchor.dataset.slotKey); if (replacement) replacement.focus(); }
  }
  function changeSpec(id, resetSchool) {
    if (!E.getSpec(data, id)) return;
    closeMenu(); state.specId = id; if (resetSchool) state.school = '';
    $('data-warnings').open = false; renderSelectors(); renderSlots(); persist();
  }
  function detailHtml(id) {
    const found = E.findTalent(spec(), id); if (!found) return '';
    const talent = found.talent;
    const requirements = [];
    if (talent.requiresCore && talent.requiresCore.length) requirements.push(`核心前置：${talent.requiresCore.join(' / ')}（满足其一）`);
    if (talent.requiresTalents && talent.requiresTalents.length) requirements.push(`奇穴前置：${talent.requiresTalents.join('、')}`);
    const adjustments = (talent.adjustments || []).slice().sort((a, b) => Number(a.round) - Number(b.round));
    return `<h3 class="detail-name">${esc(talent.name)}</h3><p class="detail-meta">${esc(spec().name)} · ${found.area === 'pool' ? '混选奇穴' : found.tier === spec().tiers[0] ? '核心奇穴' : `第 ${found.tier.index} 层`}${talent.type ? ' · ' + esc(talent.type) : ''}${isSelected(talent) ? ' · 已选择' : ''}</p>${talent.aliases && talent.aliases.length ? `<p class="detail-alias">公告别名：${talent.aliases.map(esc).join('、')}</p>` : ''}<p class="detail-description">${highlighted(talent.description || '该条未提供说明。')}</p>${requirements.length ? `<p class="detail-requirement">${requirements.map(esc).join('<br>')}</p>` : ''}${talent.requirementNote ? `<p class="detail-note">${esc(talent.requirementNote)}</p>` : ''}${talent.sourceNameNote ? `<p class="detail-note">${esc(talent.sourceNameNote)}</p>` : ''}${(talent.userCorrections || []).map(item => `<p class="detail-note">层位校对 · ${esc(item.label || '用户校对')}：${esc(item.note || '')}</p>`).join('')}${adjustments.map(item => `<div class="adjustment"><strong>${esc(roundName(item.round))}补充调整${item.date ? ' · ' + esc(item.date) : ''}</strong><p>${highlighted(item.text || '')}</p>${sourceLink(item.sourceUrl || item.url, '本轮原文')}</div>`).join('')}${sourceLink(talent.sourceUrl, `${roundName(talent.sourceRound)}官方原文`)}`;
  }
  function hideTooltip() { clearTimeout(tooltipTimer); $('talent-tooltip').hidden = true; }
  function scheduleHideTooltip() { clearTimeout(tooltipTimer); tooltipTimer = setTimeout(hideTooltip, 130); }
  function showTooltip(id, anchor) {
    if (!id || !spec() || $('detail-dialog').open) return;
    clearTimeout(tooltipTimer);
    const box = $('talent-tooltip'); box.innerHTML = detailHtml(id); if (!box.innerHTML) return; box.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const menuRect = state.group === null ? rect : $('candidate-menu').getBoundingClientRect();
    let left = menuRect.right + 10;
    if (left + box.offsetWidth > innerWidth - 12) left = menuRect.left - box.offsetWidth - 10;
    if (left < 12) left = Math.max(12, Math.min(rect.left, innerWidth - box.offsetWidth - 12));
    let top = state.group === null ? rect.bottom + 10 : rect.top;
    top = Math.max(12, Math.min(top, innerHeight - box.offsetHeight - 12));
    box.style.left = `${left}px`; box.style.top = `${top}px`;
  }
  function choose(id, keyboard) {
    const result = E.selectTalent(spec(), plan(), id);
    if (!result.ok) { hideTooltip(); toast(result.error, true); return; }
    state.drafts[state.specId] = result.plan; persist(); hideTooltip();
    const found = E.findTalent(spec(), id);
    if (found.area !== 'pool' || (result.selected && result.plan.poolSelections.length === 3)) closeMenu(keyboard);
    else { renderSlots(); renderCandidates(); if (keyboard) { const target = [...$('candidate-list').querySelectorAll('[data-select]')].find(item => item.dataset.select === id); if (target) target.focus(); } }
    if (result.removed.length) toast(`前置已变化，已取消：${result.removed.join('、')}。`);
  }
  function renderSaved() {
    $('saved-count').textContent = state.saved.length;
    $('saved-plans').innerHTML = state.saved.length ? state.saved.slice().reverse().map(item => {
      const result = E.validatePlan(data, item.plan);
      const label = result.ok ? `${result.spec.name} · ${E.progress(result.spec, result.plan).selected}/${E.progress(result.spec, result.plan).total}` : '当前数据已不兼容';
      return `<div class="saved-item${result.ok ? '' : ' invalid'}"><button class="saved-load" data-load="${esc(item.id)}" title="载入方案">${esc(item.name)}</button><div class="saved-item-meta"><span>${esc(label)}</span><button data-rename="${esc(item.id)}" aria-label="重命名${esc(item.name)}">改名</button><button data-delete="${esc(item.id)}" aria-label="删除${esc(item.name)}">删除</button></div></div>`;
    }).join('') : '<p class="empty-saved">还没有保存方案。</p>';
  }
  function openNaming(id) {
    closeMenu(); state.namingId = id || ''; const saved = state.saved.find(item => item.id === id);
    $('name-dialog-title').textContent = saved ? '重命名方案' : '保存方案';
    $('name-dialog-note').textContent = saved ? '只修改名称，已存奇穴不会改变。' : '未选满也可以保存。方案保存在当前浏览器。';
    $('plan-name').value = saved ? saved.name : `${spec().name} · 方案 ${state.saved.filter(item => item.plan.specId === state.specId).length + 1}`;
    $('name-dialog').showModal(); $('plan-name').focus(); $('plan-name').select();
  }
  function renderSources() {
    const meta = data.meta || {};
    const notes = [meta.description, ...(Array.isArray(meta.notes) ? meta.notes : meta.notes ? [meta.notes] : []), ...(Array.isArray(data.notes) ? data.notes : [])].filter(Boolean);
    $('sources-content').innerHTML = `<p class="sources-version">${esc(meta.title ? meta.title + ' · ' : '')}${esc(meta.version || '版本未标注')}</p>${notes.map(note => `<p class="sources-note">${esc(typeof note === 'string' ? note : note.text || note.message || '')}</p>`).join('')}${(meta.sources || []).map(source => `<div class="source-entry">${source.date ? `<small>${esc(source.date)}</small>` : ''}${sourceLink(source.url, source.title || source.label || '官方公告')}</div>`).join('')}<p class="sources-footer">数据来自所列官方公告，补充调整保留在奇穴全文中。本工具用于记录搭配，不计算战斗收益。<br>方案保存在当前浏览器；清除浏览器数据会一并清除，建议导出备份。</p>`;
  }
  function exportCurrent() {
    const blob = new Blob([JSON.stringify(E.exportPlan(data, plan(), `${spec().name}方案`), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${spec().name.replace(/[\\/:*?"<>|]/g, '-')}-奇穴方案.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出当前方案。');
  }
  async function copyCurrent() {
    const text = E.textPlan(data, plan());
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else { const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(area); area.select(); const success = document.execCommand('copy'); area.remove(); if (!success) throw new Error('copy failed'); }
      toast('已复制文字方案。');
    } catch (_) { toast('无法访问剪贴板，请使用 JSON 导出保存方案。', true); }
  }
  $('school-filter').addEventListener('change', event => {
    state.school = event.target.value;
    const filtered = data.specs.filter(item => !state.school || item.school === state.school);
    if (!filtered.some(item => item.id === state.specId) && filtered[0]) changeSpec(filtered[0].id);
    else renderSelectors();
  });
  $('spec-select').addEventListener('change', event => changeSpec(event.target.value));
  $('talent-search').addEventListener('input', event => { state.query = event.target.value.trim(); hideTooltip(); renderCandidates(); });
  $('close-candidates').addEventListener('click', () => closeMenu(true));
  document.addEventListener('click', event => {
    const slotButton = event.target.closest('[data-slot-key]'); if (slotButton) { openMenu(slotButton.dataset.group, slotButton.dataset.slotKey, event.detail === 0); return; }
    const selectButton = event.target.closest('[data-select]'); if (selectButton) { choose(selectButton.dataset.select, event.detail === 0); return; }
    const detailButton = event.target.closest('[data-detail]'); if (detailButton) { hideTooltip(); $('talent-detail').innerHTML = detailHtml(detailButton.dataset.detail); $('detail-dialog').showModal(); return; }
    const closeButton = event.target.closest('[data-close]'); if (closeButton) { $(closeButton.dataset.close).close(); return; }
    if (state.group !== null && !event.target.closest('#candidate-menu') && !event.target.closest('#talent-tooltip') && !event.target.closest('dialog')) closeMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { hideTooltip(); if (state.group !== null && !document.querySelector('dialog[open]')) { event.preventDefault(); closeMenu(true); } } });
  function tooltipFromEvent(event) { const target = event.target.closest('[data-talent]'); if (target) showTooltip(target.dataset.talent, target); }
  [$('slot-strip'), $('candidate-list')].forEach(region => {
    region.addEventListener('pointerover', event => { if (event.pointerType !== 'touch') tooltipFromEvent(event); });
    region.addEventListener('pointerleave', scheduleHideTooltip);
    region.addEventListener('focusin', tooltipFromEvent);
    region.addEventListener('focusout', scheduleHideTooltip);
  });
  $('talent-tooltip').addEventListener('pointerenter', () => clearTimeout(tooltipTimer)); $('talent-tooltip').addEventListener('pointerleave', scheduleHideTooltip);
  window.addEventListener('resize', () => { hideTooltip(); positionMenu(); }); window.addEventListener('scroll', () => { hideTooltip(); positionMenu(); }, { passive: true });
  $('clear-plan').addEventListener('click', () => { closeMenu(); state.drafts[state.specId] = E.emptyPlan(spec()); persist(); renderSlots(); toast('已清空当前选择，保存的方案仍可载入。'); });
  $('save-plan').addEventListener('click', () => openNaming());
  $('saved-button').addEventListener('click', () => { closeMenu(); renderSaved(); $('saved-dialog').showModal(); });
  $('name-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('plan-name').value.trim(); if (!name) { $('plan-name').setCustomValidity('请输入方案名称'); $('plan-name').reportValidity(); return; }
    const existing = state.saved.find(item => item.id === state.namingId);
    if (existing) { existing.name = name; existing.updatedAt = new Date().toISOString(); }
    else state.saved.push({ id: globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2), name, plan: JSON.parse(JSON.stringify(plan())), dataVersion: data.meta.version || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const stored = persist(); renderSaved(); $('name-dialog').close(); toast(stored ? existing ? '方案名称已更新。' : '方案已保存。' : '方案暂存于本次页面，请导出备份。', !stored);
  });
  $('plan-name').addEventListener('input', () => $('plan-name').setCustomValidity(''));
  $('saved-plans').addEventListener('click', event => {
    const loadButton = event.target.closest('[data-load]');
    if (loadButton) { const saved = state.saved.find(item => item.id === loadButton.dataset.load), result = E.validatePlan(data, saved.plan); if (!result.ok) { toast('方案与当前数据不兼容：\n' + result.errors.join('\n'), true); return; } state.drafts[result.plan.specId] = result.plan; changeSpec(result.plan.specId, true); $('saved-dialog').close(); toast(`已载入「${saved.name}」。`); return; }
    const renameButton = event.target.closest('[data-rename]'); if (renameButton) { openNaming(renameButton.dataset.rename); return; }
    const deleteButton = event.target.closest('[data-delete]'); if (deleteButton) { state.deletingId = deleteButton.dataset.delete; const saved = state.saved.find(item => item.id === state.deletingId); $('delete-message').textContent = `删除「${saved.name}」？当前奇穴选择会保留。`; $('delete-dialog').showModal(); }
  });
  $('delete-form').addEventListener('submit', event => { event.preventDefault(); state.saved = state.saved.filter(item => item.id !== state.deletingId); const stored = persist(); renderSaved(); $('delete-dialog').close(); toast(stored ? '已删除保存的方案。' : '本次页面中已删除，浏览器记录未能更新。', !stored); });
  $('export-plan').addEventListener('click', exportCurrent); $('copy-plan').addEventListener('click', copyCurrent);
  $('import-plan').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 1024 * 1024) { toast('文件超过 1 MB，请选择本模拟器导出的 JSON。', true); return; }
    try { const result = E.importPlan(data, await file.text()); if (!result.ok) { toast('导入失败，当前方案未改变：\n' + result.errors.join('\n'), true); return; } state.drafts[result.plan.specId] = result.plan; changeSpec(result.plan.specId, true); toast(`已导入${result.name ? `「${result.name}」` : '方案'}。${result.versionChanged ? '版本不同，奇穴已通过当前数据校验。' : ''}`); }
    catch (_) { toast('无法读取文件，请检查是否为有效 JSON。', true); }
  });
  $('sources-button').addEventListener('click', () => { closeMenu(); renderSources(); $('sources-dialog').showModal(); });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
  $('version-label').textContent = data.meta.version || '数据尚未载入'; renderSelectors(); renderSlots(); renderSaved();
  if (!loaded.ok) warn(loaded.error); else if (obsoleteDrafts) toast(`${obsoleteDrafts} 份旧草稿与当前数据不兼容，已恢复为空白；已存方案仍可查看。`, true);
}());
