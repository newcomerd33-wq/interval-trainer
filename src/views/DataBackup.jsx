// =============================================================================
// DATA BACKUP (export / import)
// -----------------------------------------------------------------------------
// localStorage-only app + iOS clearing site data = journal/library/schedule can
// vanish. This is the safety net: export a single JSON of every store, import it
// back. Pure storage logic lives in ../storage.js; this is the UI + file IO.
//
//   getBackup() -> backup object (App builds it from current state)
//   onImported(parsed) -> App refreshes in-memory state after a successful import
// =============================================================================

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { GroupHeader, Group, GroupFooter, CenterCard, ConfirmDeleteDialog } from './ui.jsx';
import { parseBackup, importAll } from '../storage.js';
import { todayKey } from '../date.js';

export function DataBackup({ getBackup, onImported }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirm
  const [msg, setMsg] = useState(null); // { ok, text }

  const exportNow = () => {
    try {
      const data = getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interval-trainer-backup-${todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setMsg({ ok: false, text: `Export failed: ${err.message}` });
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setPending(parsed);
    } catch (err) {
      setMsg({ ok: false, text: `Couldn’t read that file: ${err.message}` });
    }
  };

  const confirmImport = () => {
    const p = pending;
    setPending(null);
    try {
      importAll(p);
      onImported(p);
      setMsg({ ok: true, text: `Imported ${p.library.length} timers and ${p.journal.length} history entr${p.journal.length === 1 ? 'y' : 'ies'}.` });
    } catch (err) {
      setMsg({ ok: false, text: `Import failed: ${err.message}` });
    }
  };

  return (
    <>
      <GroupHeader>Data</GroupHeader>
      <Group>
        <button
          type="button"
          onClick={exportNow}
          className="sep-row press w-full text-left flex items-center px-4 py-2.5 active:bg-[var(--color-cell-pressed)]"
        >
          <Download size={20} strokeWidth={2.2} className="text-[var(--color-accent)] mr-3 shrink-0" />
          <div className="flex-1">
            <div className="text-[17px] text-white">Export backup</div>
            <div className="text-[13px] text-[var(--color-secondary)] mt-0.5">Download all timers, history, and exercises as a JSON file.</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="press w-full text-left flex items-center px-4 py-2.5 active:bg-[var(--color-cell-pressed)]"
        >
          <Upload size={20} strokeWidth={2.2} className="text-[var(--color-accent)] mr-3 shrink-0" />
          <div className="flex-1">
            <div className="text-[17px] text-white">Import backup</div>
            <div className="text-[13px] text-[var(--color-secondary)] mt-0.5">Restore from a backup file. Replaces current data.</div>
          </div>
        </button>
      </Group>
      <GroupFooter>
        Data lives only in this browser. Export regularly — clearing site data or switching devices loses everything otherwise.
      </GroupFooter>

      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />

      <ConfirmDeleteDialog
        open={!!pending}
        title="Replace all data?"
        body={<>This replaces your current timers, history, and exercises with the backup (<span className="text-white">{pending?.library.length} timers · {pending?.journal.length} entries</span>). This can’t be undone.</>}
        confirmLabel="Replace"
        onClose={() => setPending(null)}
        onConfirm={confirmImport}
      />

      <CenterCard open={!!msg} onClose={() => setMsg(null)}>
        <div className="p-5 text-center">
          <div className="text-[17px] font-semibold">{msg?.ok ? 'Done' : 'Couldn’t import'}</div>
          <div className="text-[13px] text-[var(--color-secondary)] mt-1">{msg?.text}</div>
        </div>
        <div className="border-t border-white/10">
          <button type="button" onClick={() => setMsg(null)} className="press w-full h-11 text-[15px] text-[var(--color-accent)] font-semibold">OK</button>
        </div>
      </CenterCard>
    </>
  );
}
