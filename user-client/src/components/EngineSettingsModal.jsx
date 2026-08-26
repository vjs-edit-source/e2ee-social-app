import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
  Globe,
  Smartphone,
  ShieldCheck,
  X,
  Radio,
  Sliders,
  Check,
  Cloud
} from 'lucide-react';
import {
  getEngineUrl,
  setEngineUrl,
  testEngineHealth,
  DEFAULT_LAN_ENGINE_URL,
  DEFAULT_PRODUCTION_CLOUD_URL,
  isCapacitorNative
} from '../utils/engineConfig';

export default function EngineSettingsModal({ onClose, onEngineChanged }) {
  const [customUrl, setCustomUrl] = useState('');
  const [healthStatus, setHealthStatus] = useState({ loading: true, online: false, statusText: 'Testing connection...' });
  const [testing, setTesting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const isNative = isCapacitorNative();

  useEffect(() => {
    const current = getEngineUrl();
    setCustomUrl(current || (isNative ? DEFAULT_LAN_ENGINE_URL : ''));
    runDiagnostics(current);
  }, []);

  const runDiagnostics = async (targetUrl) => {
    setTesting(true);
    setHealthStatus({ loading: true, online: false, statusText: 'Pinging engine...' });
    const result = await testEngineHealth(targetUrl);
    setHealthStatus(result);
    setTesting(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setEngineUrl(customUrl);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    if (onEngineChanged) onEngineChanged();
    runDiagnostics(customUrl);
  };

  const handleResetDefaultLAN = () => {
    setCustomUrl(DEFAULT_LAN_ENGINE_URL);
    setEngineUrl(DEFAULT_LAN_ENGINE_URL);
    if (onEngineChanged) onEngineChanged();
    runDiagnostics(DEFAULT_LAN_ENGINE_URL);
  };

  return (
    <div className="engine-modal-overlay" onClick={onClose}>
      <div className="engine-modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="engine-modal-header">
          <div className="engine-modal-title">
            <div className="engine-icon-wrap">
              <Server size={18} color="#ee7882" />
            </div>
            <div>
              <h3>SadiSocial Engine</h3>
              <p>Full-Stack Backend Connection Config</p>
            </div>
          </div>
          <button className="engine-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Live Diagnostics Banner */}
        <div className={`engine-status-banner ${healthStatus.online ? 'online' : (healthStatus.loading ? 'loading' : 'offline')}`}>
          <div className="status-banner-left">
            {healthStatus.loading ? (
              <RefreshCw size={18} className="animate-spin" color="#f59e0b" />
            ) : healthStatus.online ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : (
              <XCircle size={18} color="#ef4444" />
            )}
            <div>
              <div className="status-banner-headline">
                {healthStatus.loading ? 'Checking Connection...' : healthStatus.online ? 'Engine Connected & Active' : 'Engine Offline / Unreachable'}
              </div>
              <div className="status-banner-sub">
                {healthStatus.statusText} {healthStatus.online && `• ${healthStatus.usersCount} Registered Users`}
              </div>
            </div>
          </div>
          <button
            className="engine-test-btn"
            onClick={() => runDiagnostics(customUrl)}
            disabled={testing}
            title="Ping engine"
          >
            <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
            <span>Test Ping</span>
          </button>
        </div>

        {/* Form Config */}
        <form onSubmit={handleSave} className="engine-modal-body">
          <div className="engine-input-group">
            <label>
              <Globe size={14} />
              <span>Engine REST & WebSocket Endpoint</span>
            </label>
            <input
              type="text"
              placeholder="e.g. http://192.168.31.232:4000 or https://your-server.com"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              className="engine-url-input"
            />
            <span className="engine-input-hint">
              Used by Android App to transmit encrypted payloads, envelopes & real-time events.
            </span>
          </div>

          {/* Quick Presets */}
          <div className="engine-presets" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setCustomUrl('http://localhost:4000');
                setEngineUrl('http://localhost:4000');
                if (onEngineChanged) onEngineChanged();
                runDiagnostics('http://localhost:4000');
              }}
            >
              <Zap size={13} />
              <span>Direct Engine (Port 4000)</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setCustomUrl('http://localhost:5000');
                setEngineUrl('http://localhost:5000');
                if (onEngineChanged) onEngineChanged();
                runDiagnostics('http://localhost:5000');
              }}
            >
              <Smartphone size={13} />
              <span>Dev Proxy (Port 5000)</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setCustomUrl(DEFAULT_PRODUCTION_CLOUD_URL);
                setEngineUrl(DEFAULT_PRODUCTION_CLOUD_URL);
                if (onEngineChanged) onEngineChanged();
                runDiagnostics(DEFAULT_PRODUCTION_CLOUD_URL);
              }}
            >
              <Cloud size={13} />
              <span>Production Cloud (Render)</span>
            </button>

            <button
              type="button"
              className="preset-btn"
              onClick={handleResetDefaultLAN}
            >
              <Globe size={13} />
              <span>Wi-Fi (192.168.31.232)</span>
            </button>
          </div>

          {/* Platform Info Pill */}
          <div className="engine-platform-info">
            <ShieldCheck size={14} color="#ee7882" />
            <span>
              Running on <strong>{isNative ? 'Android Native Container (Capacitor)' : 'Mobile Web Browser'}</strong> with WebCrypto zero-knowledge envelope isolation.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="engine-modal-actions">
            <button type="button" className="engine-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="engine-btn-primary">
              {savedSuccess ? (
                <>
                  <Check size={15} />
                  <span>Saved & Connected!</span>
                </>
              ) : (
                <>
                  <Zap size={15} />
                  <span>Save & Connect</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
