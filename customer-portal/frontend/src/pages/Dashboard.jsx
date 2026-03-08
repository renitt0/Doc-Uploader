import React, { useState, useEffect, useRef } from 'react';
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

const Dashboard = () => {
  const [documents, setDocuments]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploading, setUploading]     = useState(false);
  const [deletingId, setDeletingId]   = useState(null);
  const [listError, setListError]     = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail') || 'User';

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/documents/');
      setDocuments(res.data);
      setListError('');
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        navigate('/login');
      } else {
        setListError('Failed to load documents.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    navigate('/login');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');
    setUploadSuccess('');

    const file = fileInputRef.current?.files[0];
    if (!file) { setUploadError('Please select a file.'); return; }

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Invalid type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError('File exceeds 10MB limit.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSuccess('File uploaded successfully!');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocuments();
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed.');
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
      setListError('Failed to download file.');
    }
  };

  const handleDelete = async (docId) => {
    setDeletingId(docId);
    setListError('');
    try {
      await api.delete(`/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setListError('Failed to delete. Please try again.');
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
              <button type="submit" className="btn btn-primary"
                style={{ width: 'auto' }} disabled={uploading}>
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
            <p className="empty-state">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="empty-state">No files uploaded yet.</p>
          ) : (
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
                    <td style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button className="btn btn-outline"
                        onClick={() => handleView(doc.id, doc.file_type)}>
                        View
                      </button>
                      <button className="btn btn-success"
                        onClick={() => handleDownload(doc.id, doc.original_filename)}>
                        Download
                      </button>
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
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
