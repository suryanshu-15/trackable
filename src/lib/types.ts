/**
 * Friendly aliases over the types generated from Django's OpenAPI schema (npm run gen:api).
 * Regenerate after backend serializer changes; the compiler then flags every affected screen.
 */
import type { components } from './api-schema';

type S = components['schemas'];

export type Role = S['RoleEnum'];
// role has a model default, so the schema marks it optional; the API always returns it.
export type User = S['User'] & { role: Role };

export type Supplier = S['Supplier'];
export type Material = S['Material'];
export type Unit = S['UnitOfMeasure'];
export type Location = S['StorageLocation'];
export type Factory = S['Factory'];
export type Department = S['Department'];
export type TestDefinition = S['LabTestDefinition'];

export type ReceiptStatus = S['ReceiptStatusEnum'];
export type ReceiptListItem = S['GoodsReceiptList'];
export type Receipt = S['GoodsReceipt'];
export type InvoiceLine = S['InvoiceLine'];
export type Verification = S['ReceiptLineVerification'];
export type ReceiptDocument = S['ReceiptDocument'];

export type PackageStatus = S['PackageStatusEnum'];
export type QCStatus = S['QCStatusEnum'];
export type PackageListItem = S['PackageList'];
export type Package = S['Package'];
export type Movement = S['InventoryMovement'];
export type LabelData = S['LabelData'];

export type SampleStatus = S['SampleStatusEnum'];
export type SampleListItem = S['LabSampleList'];
export type Sample = S['LabSample'];
export type TestRun = S['LabTestRun'];
export type TestResult = S['LabTestResult'];
export type Disposition = S['QualityDisposition'];
export type Hold = S['QualityHold'];

export type MaterialRequest = S['FactoryMaterialRequest'];
export type MaterialIssue = S['MaterialIssue'];
export type MaterialReturn = S['MaterialReturn'];
export type Disposal = S['DisposalRecord'];
export type Adjustment = S['StockAdjustment'];

export type Notification = S['Notification'];
export type AuditEvent = S['AuditEvent'];

/** Event in a package / receipt / sample timeline. */
export type TimelineEvent = {
  timestamp: string;
  kind?: string;
  title?: string;
  actor?: string | null;
  actor_name?: string | null;
  action?: string;
  entity_type?: string;
  reason?: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
};

export type SearchHit = { id: string; label: string; detail: string; status?: string; qc_status?: string };
export type SearchResponse = { query: string; results: Partial<Record<string, SearchHit[]>> };

export type Suggestion = {
  package: string;
  package_id: string;
  quantity: string;
  unit: string;
  batch_number: string;
  received_at: string;
  expiry_date: string | null;
  retest_date: string | null;
};

export type LineSuggestions = {
  line: string;
  material_code: string;
  remaining: string;
  unit: string;
  policy: 'FIFO' | 'FEFO';
  suggestions: Suggestion[];
  shortfall: string;
};

export type ReportMeta = { key: string; title: string; description: string; filters: string[]; exports: string[] };
export type ReportPage = {
  report: string;
  title: string;
  columns: string[];
  filters: Record<string, string>;
  count: number;
  total_pages: number;
  current_page: number;
  results: (string | number | null)[][];
};
