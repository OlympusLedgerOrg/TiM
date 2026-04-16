import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  listOperators, createOperator, updateOperator, deleteOperator,
  bulkImportOperators, type OperatorRecord, type PaginationInfo,
} from '../services/operatorManagementService';

/**
 * AdminPanel — User/Operator Management UI
 *
 * Features:
 * - CRUD for operators (list, create, edit, deactivate)
 * - Search and filter
 * - Bulk import from CSV (parse client-side)
 * - Badge ID provisioning workflow
 *
 * Requires Admin role.
 */

const cardStyle: React.CSSProperties = {
  background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '16px 20px',
};

export default function AdminPanel() {
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOp, setEditingOp] = useState<OperatorRecord | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadOperators = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listOperators({
        search: search || undefined,
        isActive: filterActive,
        page,
        pageSize: 25,
      });
      setOperators(result.operators);
      setPagination(result.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load operators');
    } finally {
      setLoading(false);
    }
  }, [search, filterActive, page]);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDelete = async (op: OperatorRecord) => {
    if (!confirm(`Deactivate operator "${op.name}"?`)) return;
    try {
      await deleteOperator(op.id);
      showSuccess(`Operator ${op.name} deactivated`);
      loadOperators();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#f1f5f9',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '12px 16px', maxWidth: 1200, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: '#111', borderRadius: 10, border: '1px solid #1e1e1e',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>⚙ Admin Panel</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Operator & Badge Management</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowBulkImport(true)}
            style={{
              background: '#1e1e1e', color: '#6b7280', border: '1px solid #333',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            📥 Bulk Import
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            + New Operator
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          padding: '12px 16px', background: '#2d1010', border: '1px solid #7f1d1d',
          borderRadius: 10, marginBottom: 12, color: '#fca5a5', fontSize: 13,
        }}>
          ⚠ {error}
        </div>
      )}
      {successMessage && (
        <div style={{
          padding: '12px 16px', background: '#052e16', border: '1px solid #14532d',
          borderRadius: 10, marginBottom: 12, color: '#4ade80', fontSize: 13,
        }}>
          ✓ {successMessage}
        </div>
      )}

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name or badge ID…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            flex: 1, padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
            border: '1px solid #333', borderRadius: 8, fontSize: 13, outline: 'none',
          }}
        />
        <select
          value={filterActive === undefined ? 'all' : filterActive ? 'active' : 'inactive'}
          onChange={e => {
            const v = e.target.value;
            setFilterActive(v === 'all' ? undefined : v === 'active');
            setPage(1);
          }}
          style={{
            background: '#1e1e1e', color: '#f1f5f9', border: '1px solid #333',
            borderRadius: 8, padding: '8px 12px', fontSize: 12,
          }}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Operators Table */}
      <div style={cardStyle}>
        {loading && operators.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading…</div>
        ) : operators.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No operators found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <th style={{ padding: '10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Badge ID</th>
                <th style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Created</th>
                <th style={{ padding: '10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {operators.map(op => (
                <tr key={op.id} style={{ borderBottom: '1px solid #1e1e1e' }}>
                  <td style={{ padding: '10px', color: '#f1f5f9', fontWeight: 600 }}>{op.name}</td>
                  <td style={{ padding: '10px', color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>
                    {op.badgeId || <span style={{ color: '#4b5563', fontStyle: 'italic' }}>No badge</span>}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: op.isActive ? '#052e16' : '#450a0a',
                      color: op.isActive ? '#4ade80' : '#f87171',
                      border: `1px solid ${op.isActive ? '#14532d' : '#7f1d1d'}`,
                    }}>
                      {op.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#6b7280', fontSize: 11 }}>
                    {new Date(op.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button
                      onClick={() => setEditingOp(op)}
                      style={{
                        background: 'none', border: 'none', color: '#60a5fa', fontSize: 12,
                        cursor: 'pointer', marginRight: 8, fontWeight: 600,
                      }}
                    >
                      Edit
                    </button>
                    {op.isActive && (
                      <button
                        onClick={() => handleDelete(op)}
                        style={{
                          background: 'none', border: 'none', color: '#f87171', fontSize: 12,
                          cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              style={{
                padding: '6px 12px', background: '#1e1e1e', color: '#6b7280',
                border: '1px solid #333', borderRadius: 6, fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              ← Prev
            </button>
            <span style={{ padding: '6px 12px', color: '#6b7280', fontSize: 12 }}>
              Page {page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
              style={{
                padding: '6px 12px', background: '#1e1e1e', color: '#6b7280',
                border: '1px solid #333', borderRadius: 6, fontSize: 12,
                cursor: page >= pagination.totalPages ? 'default' : 'pointer',
                opacity: page >= pagination.totalPages ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <OperatorFormModal
          title="Create Operator"
          onClose={() => setShowCreateModal(false)}
          onSave={async (data) => {
            await createOperator(data);
            showSuccess(`Operator ${data.name} created`);
            setShowCreateModal(false);
            loadOperators();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingOp && (
        <OperatorFormModal
          title={`Edit: ${editingOp.name}`}
          initial={editingOp}
          onClose={() => setEditingOp(null)}
          onSave={async (data) => {
            await updateOperator(editingOp.id, data);
            showSuccess(`Operator ${data.name || editingOp.name} updated`);
            setEditingOp(null);
            loadOperators();
          }}
        />
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onImport={async (ops) => {
            const result = await bulkImportOperators(ops);
            showSuccess(`Imported ${result.results.imported}, skipped ${result.results.skipped}`);
            setShowBulkImport(false);
            loadOperators();
          }}
        />
      )}
    </div>
  );
}

// ─── Operator Form Modal ──────────────────────────────────────────────────────

function OperatorFormModal({ title, initial, onClose, onSave }: {
  title: string;
  initial?: OperatorRecord;
  onClose: () => void;
  onSave: (data: { name: string; badgeId: string; isActive?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [badgeId, setBadgeId] = useState(initial?.badgeId || '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !badgeId.trim()) {
      setFormError('Name and Badge ID are required');
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      await onSave({ name: name.trim(), badgeId: badgeId.trim(), isActive });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#111', border: '1px solid #333', borderRadius: 14,
        padding: '24px', width: 400, maxWidth: '90vw',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', marginBottom: 16 }}>{title}</div>

        {formError && (
          <div style={{
            padding: '8px 12px', background: '#2d1010', border: '1px solid #7f1d1d',
            borderRadius: 8, marginBottom: 12, color: '#fca5a5', fontSize: 12,
          }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
                border: '1px solid #333', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="John Smith"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Badge ID</label>
            <input
              type="text"
              value={badgeId}
              onChange={e => setBadgeId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
                border: '1px solid #333', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                fontFamily: "'DM Mono', monospace",
              }}
              placeholder="B12345"
            />
          </div>
          {initial && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#f1f5f9', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#3b82f6' }}
                />
                Active
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', background: '#1e1e1e', color: '#6b7280',
                border: '1px solid #333', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px', background: '#1e3a5f', color: '#60a5fa',
                border: '1px solid #3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────

function BulkImportModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (operators: Array<{ name: string; badgeId: string }>) => Promise<void>;
}) {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<Array<{ name: string; badgeId: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const ops: Array<{ name: string; badgeId: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip header row
      if (i === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('badge'))) continue;

      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        ops.push({ name: parts[0], badgeId: parts[1] });
      }
    }

    return ops;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    setParsed(parseCSV(csvText));
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    try {
      setImporting(true);
      setImportError(null);
      await onImport(parsed);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#111', border: '1px solid #333', borderRadius: 14,
        padding: '24px', width: 500, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>📥 Bulk Import Operators</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          Upload a CSV file or paste CSV data. Format: Name, BadgeID (one per line).
        </div>

        {importError && (
          <div style={{
            padding: '8px 12px', background: '#2d1010', border: '1px solid #7f1d1d',
            borderRadius: 8, marginBottom: 12, color: '#fca5a5', fontSize: 12,
          }}>
            {importError}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              padding: '8px 16px', background: '#1e1e1e', color: '#f1f5f9',
              border: '1px solid #333', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            📁 Choose CSV File
          </button>
        </div>

        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder={'Name, Badge ID\nJohn Smith, B12345\nJane Doe, B12346'}
          rows={6}
          style={{
            width: '100%', padding: '8px 12px', background: '#1e1e1e', color: '#f1f5f9',
            border: '1px solid #333', borderRadius: 8, fontSize: 12, outline: 'none',
            fontFamily: "'DM Mono', monospace", resize: 'vertical', boxSizing: 'border-box',
          }}
        />

        <button
          onClick={handleParse}
          style={{
            padding: '6px 14px', background: '#1e1e1e', color: '#6b7280',
            border: '1px solid #333', borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', marginTop: 8,
          }}
        >
          Parse Preview
        </button>

        {parsed.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>
              ✓ {parsed.length} operators ready to import
            </div>
            <div style={{ maxHeight: 150, overflow: 'auto', background: '#0a0a0a', borderRadius: 8, padding: 8 }}>
              {parsed.slice(0, 10).map((op, i) => (
                <div key={i} style={{ fontSize: 11, color: '#6b7280', padding: '2px 0' }}>
                  {op.name} → {op.badgeId}
                </div>
              ))}
              {parsed.length > 10 && (
                <div style={{ fontSize: 11, color: '#4b5563', padding: '2px 0' }}>…and {parsed.length - 10} more</div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px', background: '#1e1e1e', color: '#6b7280',
              border: '1px solid #333', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={parsed.length === 0 || importing}
            style={{
              padding: '8px 16px', background: '#1e3a5f', color: '#60a5fa',
              border: '1px solid #3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: (parsed.length === 0 || importing) ? 'default' : 'pointer',
              opacity: (parsed.length === 0 || importing) ? 0.6 : 1,
            }}
          >
            {importing ? 'Importing…' : `Import ${parsed.length} Operators`}
          </button>
        </div>
      </div>
    </div>
  );
}
