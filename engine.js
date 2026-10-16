(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JX3Engine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'jx3-talent-lab';
  const STORAGE_KEY = 'jx3-talent-lab.v1';
  const POOL_LIMIT = 3;
  const clone = value => JSON.parse(JSON.stringify(value));
  const tiersOf = spec => Array.isArray(spec.tiers) ? spec.tiers : [];
  const poolOf = spec => Array.isArray(spec.pool) ? spec.pool : [];
  const keyOf = tier => String(tier.index);
  const emptyPlan = spec => ({ specId: spec.id, tierSelections: {}, poolSelections: [] });
  const getSpec = (data, id) => (data.specs || []).find(spec => spec.id === id);
  function findTalent(spec, id) {
    for (const tier of tiersOf(spec)) {
      const talent = tier.choices.find(item => item.id === id);
      if (talent) return { talent, tier, area: 'tier' };
    }
    const talent = poolOf(spec).find(item => item.id === id);
    return talent ? { talent, area: 'pool' } : null;
  }
  function coreTalent(spec, plan) {
    const first = tiersOf(spec)[0];
    return first && first.choices.find(item => item.id === plan.tierSelections[keyOf(first)]);
  }
  function availability(spec, plan, talent) {
    const required = Array.isArray(talent.requiresCore) ? talent.requiresCore : [];
    const core = coreTalent(spec, plan);
    const missing = [];
    if (required.length && !(core && required.includes(core.name))) missing.push(`需要核心奇穴：${required.join(' / ')}`);
    const selectedNames = new Set([...Object.values(plan.tierSelections), ...plan.poolSelections].map(id => findTalent(spec, id)).filter(Boolean).map(item => item.talent.name));
    const requirements = Array.isArray(talent.requiresTalents) ? talent.requiresTalents : [];
    const absent = requirements.filter(name => !selectedNames.has(name));
    if (absent.length) missing.push(`需要前置奇穴：${absent.join('、')}`);
    return { allowed: !missing.length, reason: missing.join('；') };
  }
  function cleanDependencies(spec, plan) {
    const removed = [];
    let changed;
    do {
      changed = false;
      for (const tier of tiersOf(spec)) {
        const key = keyOf(tier);
        const talent = tier.choices.find(item => item.id === plan.tierSelections[key]);
        if (talent && !availability(spec, plan, talent).allowed) {
          removed.push(talent.name);
          delete plan.tierSelections[key];
          changed = true;
        }
      }
      plan.poolSelections = plan.poolSelections.filter(id => {
        const talent = poolOf(spec).find(item => item.id === id);
        if (talent && !availability(spec, plan, talent).allowed) {
          removed.push(talent.name);
          changed = true;
          return false;
        }
        return true;
      });
    } while (changed);
    return removed;
  }
  function selectTalent(spec, plan, id) {
    const found = findTalent(spec, id);
    if (!found) return { ok: false, plan, error: '找不到这个奇穴，请重新载入数据。' };
    const next = clone(plan);
    const selected = found.area === 'pool'
      ? next.poolSelections.includes(id)
      : next.tierSelections[keyOf(found.tier)] === id;
    if (!selected) {
      const available = availability(spec, next, found.talent);
      if (!available.allowed) return { ok: false, plan, error: available.reason };
    }
    if (found.area === 'pool') {
      if (selected) next.poolSelections = next.poolSelections.filter(value => value !== id);
      else {
        if (next.poolSelections.length >= POOL_LIMIT) return { ok: false, plan, error: '混选奇穴已选满 3 个，请先取消一个。' };
        next.poolSelections.push(id);
      }
    } else {
      const key = keyOf(found.tier);
      if (selected) delete next.tierSelections[key];
      else next.tierSelections[key] = id;
    }
    const removed = cleanDependencies(spec, next);
    return { ok: true, plan: next, removed, selected: !selected };
  }
  function validatePlan(data, input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['方案格式无效。'] };
    const spec = getSpec(data, input.specId);
    if (!spec) return { ok: false, errors: ['方案中的心法不存在于当前数据。'] };
    const selected = input.tierSelections;
    if (!selected || typeof selected !== 'object' || Array.isArray(selected)) errors.push('分层奇穴格式无效。');
    if (!Array.isArray(input.poolSelections)) errors.push('混选奇穴格式无效。');
    if (errors.length) return { ok: false, errors };
    const plan = emptyPlan(spec);
    const knownTiers = new Map(tiersOf(spec).map(tier => [keyOf(tier), tier]));
    for (const [key, id] of Object.entries(selected)) {
      const tier = knownTiers.get(key);
      if (!tier) { errors.push(`当前数据不存在第 ${key} 层。`); continue; }
      if (typeof id !== 'string' || !tier.choices.some(item => item.id === id)) {
        errors.push(`第 ${key} 层包含未知或不属于该层的奇穴。`);
      } else plan.tierSelections[key] = id;
    }
    if (input.poolSelections.length > POOL_LIMIT) errors.push('混选奇穴不能超过 3 个。');
    if (new Set(input.poolSelections).size !== input.poolSelections.length) errors.push('混选奇穴不能重复。');
    for (const id of input.poolSelections) {
      if (typeof id !== 'string' || !poolOf(spec).some(item => item.id === id)) errors.push('混选奇穴中包含未知奇穴。');
      else plan.poolSelections.push(id);
    }
    for (const id of [...Object.values(plan.tierSelections), ...plan.poolSelections]) {
      const item = findTalent(spec, id);
      const result = availability(spec, plan, item.talent);
      if (!result.allowed) errors.push(`${item.talent.name}：${result.reason}`);
    }
    return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, plan, spec };
  }
  function progress(spec, plan) {
    const selected = Object.keys(plan.tierSelections).length + plan.poolSelections.length;
    const total = tiersOf(spec).length + POOL_LIMIT;
    return { selected, total, complete: selected === total };
  }
  function exportPlan(data, plan, name) {
    const result = validatePlan(data, plan);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return { format: FORMAT, schemaVersion: 1, dataVersion: data.meta && data.meta.version || '', name: name || '', exportedAt: new Date().toISOString(), plan: clone(result.plan) };
  }
  function importPlan(data, value) {
    let parsed;
    try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
    catch (_) { return { ok: false, errors: ['不是有效的 JSON 文件。'] }; }
    if (!parsed || parsed.format !== FORMAT || parsed.schemaVersion !== 1) return { ok: false, errors: ['无法识别方案文件，请使用本模拟器导出的 JSON。'] };
    const result = validatePlan(data, parsed.plan);
    if (!result.ok) return result;
    return { ...result, name: typeof parsed.name === 'string' ? parsed.name.slice(0, 80) : '', versionChanged: parsed.dataVersion !== (data.meta && data.meta.version || '') };
  }
  function textPlan(data, plan) {
    const spec = getSpec(data, plan.specId);
    if (!spec) return '';
    const lines = [`${spec.school} · ${spec.name}`, `版本：${data.meta && data.meta.version || '未标注'}`];
    tiersOf(spec).forEach((tier, index) => {
      const found = tier.choices.find(item => item.id === plan.tierSelections[keyOf(tier)]);
      lines.push(`${index === 0 ? '核心' : `第 ${tier.index} 层`}：${found ? found.name : '未选择'}`);
    });
    lines.push(`混选奇穴（${plan.poolSelections.length}/3）：${plan.poolSelections.map(id => findTalent(spec, id).talent.name).join('、') || '未选择'}`);
    return lines.join('\n');
  }
  function createStorage(storage) {
    let memory = { schemaVersion: 1, currentSpecId: '', drafts: {}, saved: [] };
    let lastError = '';
    return {
      load() {
        try {
          const raw = storage.getItem(STORAGE_KEY);
          if (!raw) return { ok: true, value: clone(memory) };
          const value = JSON.parse(raw);
          if (!value || value.schemaVersion !== 1 || !Array.isArray(value.saved) || !value.drafts || typeof value.drafts !== 'object' || Array.isArray(value.drafts)) throw new Error('invalid');
          memory = { schemaVersion: 1, currentSpecId: typeof value.currentSpecId === 'string' ? value.currentSpecId : '', drafts: value.drafts, saved: value.saved };
          return { ok: true, value: clone(memory) };
        } catch (_) {
          lastError = '无法读取本地记录；本次仍可使用，建议导出 JSON 备份。';
          return { ok: false, value: clone(memory), error: lastError };
        }
      },
      write(value) {
        memory = clone(value);
        try { storage.setItem(STORAGE_KEY, JSON.stringify(memory)); lastError = ''; return { ok: true }; }
        catch (_) { lastError = '浏览器未能保存本地记录；关闭页面前请导出 JSON。'; return { ok: false, error: lastError }; }
      },
      get error() { return lastError; }
    };
  }
  return { FORMAT, STORAGE_KEY, POOL_LIMIT, emptyPlan, getSpec, findTalent, coreTalent, availability, selectTalent, validatePlan, progress, exportPlan, importPlan, textPlan, createStorage };
}));
