'use client';

import { useRef, useState, type FormEvent } from 'react';
import { api, download } from '@/lib/api';
import { fmtDateTime, humanize } from '@/lib/format';
import { ActionError, Button, Empty } from './ui';
import { SelectField, TextField } from './forms';
import { useToast } from './Toast';

type Doc = {
  id: string; document_type: string; original_filename: string; file_size_bytes: number;
  uploaded_by_name: string; download_url: string; created_at: string; notes: string;
};

const MAX_MB = 20;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.doc,.txt';

/** API download URLs may be absolute; the BFF needs the part after /api/v1/. */
export function apiPath(url: string): string {
  const i = url.indexOf('/api/v1/');
  return i >= 0 ? url.slice(i + '/api/v1/'.length) : url;
}

export function Attachments({ docs, uploadPath, types, canUpload, onUploaded }: {
  docs: Doc[]; uploadPath: string; types: string[]; canUpload: boolean; onUploaded: () => void;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState(types[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) { setError(new Error('Choose a file to upload.')); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(new Error(`The file is larger than ${MAX_MB} MB.`)); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('document_type', type);
    if (notes) form.append('notes', notes);
    setBusy(true);
    setError(null);
    try {
      await api(uploadPath, { method: 'POST', form });
      toast(`${file.name} uploaded.`);
      setNotes('');
      if (fileInput.current) fileInput.current.value = '';
      onUploaded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const get = async (doc: Doc) => {
    try {
      await download(apiPath(doc.download_url));
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  };

  return (
    <div className="space-y-4">
      {docs.length === 0 ? <Empty>No documents attached.</Empty> : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-900">{d.original_filename}</div>
                <div className="text-xs text-slate-500">
                  {humanize(d.document_type)} · {(d.file_size_bytes / 1024).toFixed(0)} KB · {d.uploaded_by_name} · {fmtDateTime(d.created_at)}
                  {d.notes && ` · ${d.notes}`}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => get(d)}>Download</Button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form onSubmit={upload} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
          <SelectField label="Document type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Type" options={types.map((t) => ({ value: t, label: humanize(t) }))} />
          <div>
            <label htmlFor="attachment-file" className="block text-sm font-medium text-slate-700">File</label>
            <input id="attachment-file" ref={fileInput} type="file" accept={ACCEPT} className="mt-1 block w-full text-sm" />
          </div>
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button type="submit" loading={busy}>Upload</Button>
          <div className="sm:col-span-4"><ActionError error={error} /></div>
        </form>
      )}
    </div>
  );
}
