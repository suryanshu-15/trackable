/** Field and column definitions for the admin Master data screens (one entry per kind). */

export type OptionSource = 'units' | 'categories' | 'warehouses' | 'locations' | 'factories' | 'tests';

export type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'tests' | 'list';
  required?: boolean;
  source?: OptionSource;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  /** Show only when another field has a given value (e.g. min / max for numeric tests). */
  when?: { field: string; equals: string };
  wide?: boolean;
};

export type ColumnDef = { label: string; value: (row: Record<string, unknown>) => string };

export type KindDef = {
  slug: string;
  path: string;
  title: string;
  noun: string;
  description: string;
  hasActive: boolean;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaults?: Record<string, unknown>;
  /** Placeholder for the search box: which fields it searches. */
  searchHint: string;
};

const str = (k: string) => (r: Record<string, unknown>) => (r[k] === null || r[k] === undefined || r[k] === '' ? '—' : String(r[k]));
const yes = (k: string) => (r: Record<string, unknown>) => (r[k] ? 'Yes' : 'No');
const typeOptions = (values: string[]) => values.map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ') }));

export const MASTER_KINDS: KindDef[] = [
  {
    slug: 'suppliers', searchHint: 'Code, name, GST, phone, email, contact, address…', path: 'master/suppliers', title: 'Suppliers', noun: 'supplier', hasActive: true,
    description: 'Companies that deliver material. Used on gate receipts, reports and recalls.',
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. SUP-014' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'contact_person', label: 'Contact person', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'gst_number', label: 'GST number', type: 'text' },
      { name: 'address', label: 'Address', type: 'textarea', wide: true },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Contact', value: str('contact_person') },
      { label: 'Phone', value: str('phone') }, { label: 'GST', value: str('gst_number') }],
  },
  {
    slug: 'materials', searchHint: 'Code, name, HSN, category, unit, lab test…', path: 'master/materials', title: 'Materials', noun: 'material', hasActive: true,
    description: 'What arrives in the bags: unit, lab testing, dates and issue rules.',
    defaults: { qc_required: true, requires_expiry: true, requires_retest: true, allow_partial_issue: false },
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. MAT-120' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', source: 'categories' },
      { name: 'default_unit', label: 'Unit', type: 'select', source: 'units', required: true, hint: 'Bags are counted in tonnes.' },
      { name: 'hsn_code', label: 'HSN code', type: 'text' },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'shelf_life_days', label: 'Shelf life (days)', type: 'number', hint: 'Used to suggest expiry dates.' },
      { name: 'retest_interval_days', label: 'Retest interval (days)', type: 'number' },
      { name: 'min_stock_quantity', label: 'Minimum stock', type: 'number', hint: 'Low-stock alert below this.' },
      { name: 'min_stock_unit', label: 'Minimum stock unit', type: 'select', source: 'units' },
      { name: 'qc_required', label: 'Needs lab testing before use', type: 'checkbox' },
      { name: 'requires_expiry', label: 'Bags need an expiry date', type: 'checkbox' },
      { name: 'requires_retest', label: 'Bags need a retest date', type: 'checkbox' },
      { name: 'allow_partial_issue', label: 'Bags may be issued partly', type: 'checkbox', hint: 'The business rule "whole bags only" overrides this.' },
      { name: 'test_ids', label: 'Lab tests for this material', type: 'tests', wide: true },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Category', value: str('category_name') },
      { label: 'Unit', value: str('default_unit_symbol') }, { label: 'Lab testing', value: yes('qc_required') },
      { label: 'Tests', value: (r) => String((r.test_requirements as unknown[] | undefined)?.length ?? 0) }],
  },
  {
    slug: 'categories', searchHint: 'Code, name, notes…', path: 'master/material-categories', title: 'Material categories', noun: 'category', hasActive: false,
    description: 'Groups of materials; date rules here apply to every material in the group.',
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'default_shelf_life_days', label: 'Default shelf life (days)', type: 'number' },
      { name: 'requires_expiry', label: 'Materials need expiry dates', type: 'checkbox' },
      { name: 'requires_retest', label: 'Materials need retest dates', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Expiry', value: yes('requires_expiry') },
      { label: 'Retest', value: yes('requires_retest') }],
  },
  {
    slug: 'units', searchHint: 'Code, name, symbol, type…', path: 'master/units', title: 'Units', noun: 'unit', hasActive: true,
    description: 'Units of measure for quantities and weights.',
    defaults: { unit_type: 'WEIGHT' },
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. T' },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Tonne' },
      { name: 'symbol', label: 'Symbol', type: 'text', required: true, placeholder: 'e.g. t' },
      { name: 'unit_type', label: 'Type', type: 'select', options: typeOptions(['WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'AREA', 'OTHER']) },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Symbol', value: str('symbol') },
      { label: 'Type', value: (r) => String(r.unit_type ?? '').toLowerCase() }],
  },
  {
    slug: 'unit-conversions', searchHint: 'Unit code or symbol…', path: 'master/unit-conversions', title: 'Unit conversions', noun: 'conversion', hasActive: false,
    description: 'How to convert between units (e.g. 1 t = 1000 kg) when comparing invoice and received quantities.',
    fields: [
      { name: 'from_unit', label: 'From unit', type: 'select', source: 'units', required: true },
      { name: 'to_unit', label: 'To unit', type: 'select', source: 'units', required: true },
      { name: 'factor', label: 'Factor', type: 'number', required: true, hint: '1 "from" = factor × "to", e.g. t → kg = 1000.' },
      { name: 'notes', label: 'Notes', type: 'text' },
    ],
    columns: [{ label: 'From', value: str('from_unit_display') }, { label: 'To', value: str('to_unit_display') }, { label: 'Factor', value: str('factor') }],
  },
  {
    slug: 'warehouses', searchHint: 'Code, name, address…', path: 'master/warehouses', title: 'Warehouses', noun: 'warehouse', hasActive: true,
    description: 'Sites that hold stock. Each has its own storage locations.',
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Address', value: str('address') }],
  },
  {
    slug: 'locations', searchHint: 'Code, name, type, warehouse, parent…', path: 'master/locations', title: 'Storage locations', noun: 'location', hasActive: true,
    description: 'Zones, racks, shelves and bins. Bags are stored only in locations with nothing inside them; quarantine locations hold stock awaiting QC.',
    defaults: { location_type: 'SHELF', is_quarantine: false },
    fields: [
      { name: 'warehouse', label: 'Warehouse', type: 'select', source: 'warehouses', required: true },
      { name: 'parent', label: 'Inside', type: 'select', source: 'locations', hint: 'Leave empty for a top-level zone.' },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. A-R3-S1' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'location_type', label: 'Type', type: 'select', options: typeOptions(['ZONE', 'RACK', 'SHELF', 'BIN', 'QUARANTINE', 'DISPATCH']) },
      { name: 'capacity_quantity', label: 'Capacity', type: 'number' },
      { name: 'capacity_unit', label: 'Capacity unit', type: 'select', source: 'units' },
      { name: 'is_quarantine', label: 'Quarantine / pending-QC location', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Location', value: str('full_path') }, { label: 'Name', value: str('name') }, { label: 'Type', value: (r) => String(r.location_type ?? '').toLowerCase() },
      { label: 'Quarantine', value: yes('is_quarantine') }, { label: 'Warehouse', value: str('warehouse_name') }],
  },
  {
    slug: 'tests', searchHint: 'Code, name, method, type, unit…', path: 'master/test-definitions', title: 'Lab tests', noun: 'lab test', hasActive: true,
    description: 'Tests the lab runs, with the limits that decide pass or fail.',
    defaults: { result_type: 'NUMERIC', is_required: true },
    fields: [
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. MOIST' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'method', label: 'Method', type: 'text' },
      { name: 'result_type', label: 'Result type', type: 'select', options: [{ value: 'NUMERIC', label: 'Number' }, { value: 'TEXT', label: 'Text' }, { value: 'BOOLEAN', label: 'Pass / fail' }] },
      { name: 'unit', label: 'Unit', type: 'select', source: 'units' },
      { name: 'min_value', label: 'Minimum', type: 'number', when: { field: 'result_type', equals: 'NUMERIC' } },
      { name: 'max_value', label: 'Maximum', type: 'number', when: { field: 'result_type', equals: 'NUMERIC' } },
      { name: 'acceptable_text_values', label: 'Acceptable values', type: 'list', when: { field: 'result_type', equals: 'TEXT' }, hint: 'Comma-separated.' },
      { name: 'is_required', label: 'Required for release', type: 'checkbox' },
      { name: 'description', label: 'Description', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Type', value: (r) => String(r.result_type ?? '').toLowerCase() },
      { label: 'Limits', value: (r) => (r.result_type === 'NUMERIC' ? `${r.min_value ?? '−∞'} – ${r.max_value ?? '∞'} ${r.unit_symbol ?? ''}` : r.result_type === 'TEXT' ? ((r.acceptable_text_values as string[]) ?? []).join(' / ') || 'Analyst judgement' : 'Pass / fail') },
      { label: 'Required', value: yes('is_required') }],
  },
  {
    slug: 'factories', searchHint: 'Code, name…', path: 'master/factories', title: 'Factories', noun: 'factory', hasActive: true,
    description: 'Where issued material goes.',
    fields: [{ name: 'code', label: 'Code', type: 'text', required: true }, { name: 'name', label: 'Name', type: 'text', required: true }],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }],
  },
  {
    slug: 'departments', searchHint: 'Code, name, factory…', path: 'master/departments', title: 'Departments', noun: 'department', hasActive: true,
    description: 'Departments within each factory, used on material requests.',
    fields: [
      { name: 'factory', label: 'Factory', type: 'select', source: 'factories', required: true },
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
    ],
    columns: [{ label: 'Code', value: str('code') }, { label: 'Name', value: str('name') }, { label: 'Factory', value: str('factory_name') }],
  },
];

export const kindBySlug = (slug: string) => MASTER_KINDS.find((k) => k.slug === slug);
