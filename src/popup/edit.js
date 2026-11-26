import { parseDomains } from '../lib/sites.js';
import { $, toast, t } from '../ui/dom.js';
import { state, show, persist, confirmButton } from './ui.js';

export function openEdit(id) {
  const acc = state.accounts.find((a) => a.id === id);
  if (!acc) return;
  state.editingId = id;
  const form = $('#edit-form');
  form.issuer.value = acc.issuer;
  form.account.value = acc.account;
  form.domains.value = (acc.domains || []).join(', ');
  show('edit');
}

$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const acc = state.accounts.find((a) => a.id === state.editingId);
  if (!acc) return show('main');
  const form = e.currentTarget;
  acc.issuer = form.issuer.value.trim();
  acc.account = form.account.value.trim();
  acc.domains = parseDomains(form.domains.value);
  acc.ignoredDomains = (acc.ignoredDomains || []).filter((d) => !acc.domains.includes(d));
  await persist();
  toast(t('edit.saved'));
  show('main');
});

confirmButton($('#btn-delete'), () => t('edit.confirm'), async () => {
  state.accounts = state.accounts.filter((a) => a.id !== state.editingId);
  state.codes.delete(state.editingId);
  await persist();
  toast(t('edit.deleted'));
  show('main');
});
