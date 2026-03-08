import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.png', '.docx'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_TYPES = {
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

// Auto-dismiss helper: sets a message and clears it after `ms` milliseconds
const useAutoDismiss = (ms = 5000) => {
  const [msg, setMsg] = useState('');
  const timerRef = useRef(null);

  const show = useCallback((text) => {
    clearTimeout(timerRef.current);
    setMsg(text);
    timerRef.current = setTimeout(() => setMsg(''), ms);
  }, [ms]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [msg, show];
};

const Dashboard = () => {
  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [listError, setListError]   = useState('');

  const [uploadError,   showUploadError]   = useAutoDismiss(5000);
  const [uploadSuccess, showUploadSuccess] = useAutoDismiss(5000);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || 'User';

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api.get('/documents/');
      setDocuments(res.data);
      setListError('');
    } catch {
      // 401 is handled globally by api.js interceptor
      setListError('Failed to load files. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleLogout = () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    navigate('/login');
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    const file = fileInputRef.current?.files[0];
    if (!file) {
      showUploadError('Please select a file before uploading.');
      return;
    }

    // Client-side extension check
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      showUploadError('Invalid file type. Only .pdf, .jpg, .png, .docx are allowed.');
      return;
    }

    // Client-side size check
    if (file.size > MAX_SIZE_BYTES) {
      showUploadError('File too large. Maximum size is 10MB.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showUploadSuccess('File uploaded successfully!');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocuments();
    } catch (err) {
      const detail = err.response?.data?.detail;
      showUploadError(detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (id, fileType) => {
    try {
      const response = await api.get(`/documents/${id}/download`, {
        responseType: 'blob',
      });
      const mimeType = MIME_TYPES[fileType] || 'application/octet-stream';
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: mimeType }));
      window.open(blobUrl, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      setListError('Failed to open file for viewing.');
    }
  };

  const handleDownload = async (id, filename) => {
    try {
      const response = await api.get(`/documents/${id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setListError('Failed to download file. Please try again.');
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this file? This cannot be undone.')) return;
    setDeletingId(docId);
    setListError('');
    try {
      await api.delete(`/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setListError('Failed to delete file. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-full">
      {/* Header */}
      <header className="app-header">
        <p className="app-header-title">
          Welcome, <span>{userEmail}</span>
        </p>
        <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
      </header>

      <main className="content-area">
        {/* Upload */}
        <div className="card mb-md">
          <p className="card-title">Upload File</p>
          <form onSubmit={handleUpload}>
            <div className="upload-row">
              <input type="file" ref={fileInputRef} className="file-input"
                accept=".pdf,.jpg,.png,.docx" />
              <button type="submit" className="btn btn-primary btn-auto"
                disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            {uploadError   && <div className="alert alert-error">{uploadError}</div>}
            {uploadSuccess && <div className="alert alert-success">{uploadSuccess}</div>}
          </form>
        </div>

        {/* File Table */}
        <div className="card">
          <p className="card-title">Your Files</p>
          {listError && <div className="alert alert-error">{listError}</div>}

          {loading ? (
            <p className="empty-state">Loading your files...</p>
          ) : documents.length === 0 ? (
            <p className="empty-state">No files uploaded yet.</p>
          ) : (
            <>
              {/* ── Desktop Table ── */}
              <div className="file-table table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Filename</th><th>Type</th><th>Size</th>
                      <th>Uploaded At</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>{doc.original_filename}</td>
                        <td><span className="badge">{doc.file_type.replace('.', '')}</span></td>
                        <td>{formatSize(doc.file_size)}</td>
                        <td>{formatDate(doc.uploaded_at)}</td>
                        <td className="table-action-cell">
                          <button className="btn btn-outline"
                            onClick={() => handleView(doc.id, doc.file_type)}
                            disabled={doc.file_type === '.docx'}
                            title={doc.file_type === '.docx' ? 'Word documents cannot be previewed in the browser' : 'Open in new tab'}>
                            View
                          </button>
                          <button className="btn btn-success"
                            onClick={() => handleDownload(doc.id, doc.original_filename)}>Download</button>
                          <button className="btn btn-danger"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}>
                            {deletingId === doc.id ? '...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile Cards ── */}
              <div className="file-cards">
                {documents.map((doc) => (
                  <div key={doc.id} className="file-card">
                    <p className="file-card-name">{doc.original_filename}</p>
                    <p className="file-card-meta">
                      <span className="badge">{doc.file_type.replace('.', '')}</span>
                      {' · '}{formatSize(doc.file_size)}
                      {' · '}{formatDate(doc.uploaded_at)}
                    </p>
                    <div className="file-card-actions">
                      <button className="btn btn-outline"
                        onClick={() => handleView(doc.id, doc.file_type)}
                        disabled={doc.file_type === '.docx'}
                        title={doc.file_type === '.docx' ? 'Word documents cannot be previewed in the browser' : 'Open in new tab'}>
                        View
                      </button>
                      <button className="btn btn-success"
                        onClick={() => handleDownload(doc.id, doc.original_filename)}>Save</button>
                      <button className="btn btn-danger"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}>
                        {deletingId === doc.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
