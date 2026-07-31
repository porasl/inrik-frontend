import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listVideoConversionFailures,
  reprocessVideoConversion,
} from '../services/videoConversionFailuresService.js';
import './FailedVideoConversionsPage.css';

const dateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const statusClass = {
  FAILED: 'text-bg-danger',
  PROCESSING: 'text-bg-warning',
  RESOLVED: 'text-bg-success',
};

export default function FailedVideoConversionsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setRecords(await listVideoConversionFailures());
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Failed conversion records could not be loaded.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!records.some((record) => record.status === 'PROCESSING')) return undefined;
    const timer = globalThis.setInterval(() => load({ quiet: true }), 4000);
    return () => globalThis.clearInterval(timer);
  }, [load, records]);

  const visibleRecords = useMemo(
    () => records.filter((record) => showResolved || record.status !== 'RESOLVED'),
    [records, showResolved],
  );
  const failedCount = records.filter((record) => record.status === 'FAILED').length;

  const reprocess = async (record) => {
    setBusyId(record.id);
    setMessage('');
    try {
      await reprocessVideoConversion(record.id);
      setMessage(`Reprocessing ${record.sourceName} started.`);
      await load({ quiet: true });
    } catch (error) {
      setMessage(error.message || 'The conversion could not be started.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="failed-conversions-page">
      <div className="failed-conversions-header">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <i className="bi bi-exclamation-octagon-fill text-danger fs-3" aria-hidden="true"></i>
            <h2 className="mb-0">Failed video conversions</h2>
          </div>
          <p className="text-muted mb-0">
            Review FFmpeg failures and retry HLS generation from the original upload.
          </p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={() => load()} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>
          Refresh
        </button>
      </div>

      <div className="failed-conversions-summary">
        <span className="badge text-bg-danger">{failedCount} failed</span>
        <span className="badge text-bg-light border">{records.length} total records</span>
        <label className="form-check form-switch mb-0 ms-auto">
          <input
            className="form-check-input"
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          <span className="form-check-label">Show resolved</span>
        </label>
      </div>

      {message && <div className="alert alert-info py-2" role="status">{message}</div>}

      {loading ? (
        <div className="failed-conversions-empty">
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          Loading conversion records…
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="failed-conversions-empty">
          <i className="bi bi-check-circle-fill text-success fs-2" aria-hidden="true"></i>
          <strong>No unresolved video conversions.</strong>
        </div>
      ) : (
        <div className="table-responsive failed-conversions-table-wrap">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Video</th>
                <th>Status</th>
                <th>Failure</th>
                <th>Last failure</th>
                <th>Retries</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong className="d-block">{record.sourceName}</strong>
                    <small className="text-muted failed-conversions-path" title={record.inputPath}>
                      {record.inputPath}
                    </small>
                  </td>
                  <td>
                    <span className={`badge ${statusClass[record.status] || 'text-bg-secondary'}`}>
                      {record.status}
                    </span>
                  </td>
                  <td>
                    <span className="failed-conversions-error" title={record.errorMessage}>
                      {record.errorMessage}
                    </span>
                  </td>
                  <td>{dateTime(record.lastFailedAt)}</td>
                  <td>{record.attemptCount || 0}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={record.status === 'PROCESSING' || busyId === record.id}
                      onClick={() => reprocess(record)}
                    >
                      {(record.status === 'PROCESSING' || busyId === record.id) ? (
                        <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Processing</>
                      ) : (
                        <><i className="bi bi-arrow-repeat me-2" aria-hidden="true"></i>Reprocess</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
