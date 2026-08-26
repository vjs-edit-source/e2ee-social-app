import React, { useState, useEffect } from 'react';
import {
  Database,
  ShieldAlert,
  RefreshCw,
  Key,
  MessageSquare,
  Rss,
  Image,
  Clock,
  Users,
  Sparkles,
  Heart,
  Globe,
  Lock
} from 'lucide-react';

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return String(isoString);
  }
}

export default function ServerInspector({ serverUrl, wsClient }) {
  const [snapshot, setSnapshot] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('posts');
  const [loading, setLoading] = useState(true);

  const loadSnapshot = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/inspector`);
      const data = await res.json();
      setSnapshot(data);
    } catch (err) {
      console.error("Failed to load server audit snapshot:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
  }, []);

  // Listen to live WebSocket inspector broadcasts
  useEffect(() => {
    if (!wsClient) return;

    const handleWSMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INSPECTOR_UPDATE') {
          setSnapshot(data.snapshot);
        }
      } catch (e) {
        console.error("Inspector parse error:", e);
      }
    };

    wsClient.addEventListener('message', handleWSMessage);
    return () => wsClient.removeEventListener('message', handleWSMessage);
  }, [wsClient]);

  if (loading || !snapshot) {
    return (
      <div className="inspector-loading">
        <RefreshCw size={24} className="spin-icon" />
        <p>Connecting to Zero-Knowledge Server Database Stream...</p>
      </div>
    );
  }

  const groupsList = snapshot.groups || [];
  const statusesList = snapshot.statuses || [];

  return (
    <div className="inspector-container">
      {/* Zero Knowledge Audit Banner */}
      <div className="audit-banner">
        <div className="banner-icon">
          <ShieldAlert size={32} color="#f59e0b" />
        </div>
        <div className="banner-content">
          <h2>Server Zero-Knowledge Audit Dashboard</h2>
          <p>
            This live inspector view directly queries the backend server database state.
            Notice that the server database stores <strong>ONLY public keys, Base64 AES-GCM ciphertexts, Key Envelopes, and timestamps</strong>.
            The server does NOT hold any private keys, unencrypted post text, direct messages, group chats, or statuses.
          </p>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <Key size={24} color="#3b82f6" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalUsers}</div>
            <div className="metric-label">Public Identity Keys</div>
          </div>
        </div>

        <div className="metric-card">
          <Rss size={24} color="#8b5cf6" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalPosts}</div>
            <div className="metric-label">Envelope Posts</div>
          </div>
        </div>

        <div className="metric-card">
          <Users size={24} color="#e06c75" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalGroups || 0}</div>
            <div className="metric-label">Groups &amp; Communities</div>
          </div>
        </div>

        <div className="metric-card">
          <Sparkles size={24} color="#ee7882" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalStatuses || 0}</div>
            <div className="metric-label">Active 24h Statuses</div>
          </div>
        </div>

        <div className="metric-card">
          <MessageSquare size={24} color="#10b981" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalMessages}</div>
            <div className="metric-label">Encrypted DMs</div>
          </div>
        </div>

        <div className="metric-card">
          <Image size={24} color="#ec4899" />
          <div className="metric-info">
            <div className="metric-value">{snapshot.totalMediaBlobs}</div>
            <div className="metric-label">Encrypted Media Blobs</div>
          </div>
        </div>
      </div>

      {/* Database Raw Tables Inspector */}
      <div className="inspector-table-card">
        <div className="table-header">
          <div className="sub-tabs">
            <button
              className={`sub-tab ${activeSubTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('posts')}
            >
              <Rss size={14} />
              Posts ({snapshot.posts.length})
            </button>

            <button
              className={`sub-tab ${activeSubTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('groups')}
            >
              <Users size={14} />
              Groups ({groupsList.length})
            </button>

            <button
              className={`sub-tab ${activeSubTab === 'statuses' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('statuses')}
            >
              <Sparkles size={14} />
              24h Statuses ({statusesList.length})
            </button>

            <button
              className={`sub-tab ${activeSubTab === 'messages' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('messages')}
            >
              <MessageSquare size={14} />
              Messages ({snapshot.messages.length})
            </button>

            <button
              className={`sub-tab ${activeSubTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('users')}
            >
              <Key size={14} />
              Prekey Directory ({snapshot.users.length})
            </button>

            <button
              className={`sub-tab ${activeSubTab === 'media' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('media')}
            >
              <Image size={14} />
              Media Storage ({snapshot.media.length})
            </button>
          </div>

          <button className="refresh-btn" onClick={loadSnapshot}>
            <RefreshCw size={14} />
            <span>Refresh State</span>
          </button>
        </div>

        <div className="table-content">
          {/* 1. Posts Database */}
          {activeSubTab === 'posts' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Post ID</th>
                    <th>Author</th>
                    <th>Encrypted Date &amp; Time</th>
                    <th>Raw Base64 Ciphertext (Post Body)</th>
                    <th>IV</th>
                    <th>Key Envelopes</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.posts.map(p => (
                    <tr key={p.id}>
                      <td><code>{p.id}</code></td>
                      <td><strong>{p.author}</strong></td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#f59e0b" />
                          <span>{formatDateTime(p.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ciphertext-code">{p.ciphertext}</div>
                      </td>
                      <td><code>{p.iv}</code></td>
                      <td>
                        <span className="envelope-count-badge">
                          {Object.keys(p.keyEnvelopes || {}).length} Recipients Wrapped
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. Groups & Communities Database */}
          {activeSubTab === 'groups' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Group ID</th>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Creator</th>
                    <th>Members Count</th>
                    <th>Encrypted Messages</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {groupsList.map(g => (
                    <tr key={g.id}>
                      <td><code>{g.id}</code></td>
                      <td>
                        <span className={`group-type-badge ${g.isCommunity ? 'community' : 'group'}`}>
                          {g.isCommunity ? 'Public Community' : 'Private Group'}
                        </span>
                      </td>
                      <td><strong>{g.name}</strong></td>
                      <td>{g.creator}</td>
                      <td>
                        <span className="envelope-count-badge">
                          {g.isCommunity ? 'All Users' : `${g.membersCount} Members`}
                        </span>
                      </td>
                      <td>
                        <span className="timestamp-badge">
                          <Lock size={12} color="#10b981" />
                          <span>{g.totalMessages || 0} msgs</span>
                        </span>
                      </td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#3b82f6" />
                          <span>{formatDateTime(g.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. Ephemeral 24h Statuses Database */}
          {activeSubTab === 'statuses' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Status ID</th>
                    <th>Author</th>
                    <th>Likes Count</th>
                    <th>Comments</th>
                    <th>Envelopes</th>
                    <th>Posted Date</th>
                    <th>Expires At (24h)</th>
                  </tr>
                </thead>
                <tbody>
                  {statusesList.map(s => (
                    <tr key={s.id}>
                      <td><code>{s.id}</code></td>
                      <td><strong>{s.author}</strong></td>
                      <td>
                        <span className="timestamp-badge" style={{ color: '#ee7882' }}>
                          <Heart size={12} fill="#ee7882" />
                          <span>{s.likesCount || 0} likes ({s.likes?.join(', ') || 'none'})</span>
                        </span>
                      </td>
                      <td>
                        <span className="envelope-count-badge">
                          {s.commentsCount || 0} Encrypted Comments
                        </span>
                      </td>
                      <td>
                        <span className="envelope-count-badge">
                          {s.envelopesCount || 0} Wrapped Keys
                        </span>
                      </td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#f59e0b" />
                          <span>{formatDateTime(s.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#10b981" />
                          <span>{formatDateTime(s.expiresAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. Messages Database */}
          {activeSubTab === 'messages' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Message ID</th>
                    <th>Sender</th>
                    <th>Recipient</th>
                    <th>Encrypted Date &amp; Time</th>
                    <th>Raw Base64 Ciphertext</th>
                    <th>IV</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.messages.map(m => (
                    <tr key={m.id}>
                      <td><code>{m.id}</code></td>
                      <td><strong>{m.sender}</strong></td>
                      <td><strong>{m.recipient}</strong></td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#10b981" />
                          <span>{formatDateTime(m.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="ciphertext-code">{m.ciphertext}</div>
                      </td>
                      <td><code>{m.iv}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. Prekey Directory */}
          {activeSubTab === 'users' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Registration / Key Date &amp; Time</th>
                    <th>Public Identity Key (SPKI Base64 Format)</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.users.map(u => (
                    <tr key={u.username}>
                      <td><strong>{u.username}</strong></td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#3b82f6" />
                          <span>{formatDateTime(u.registeredAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="key-code">{u.publicIdentityKey}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. Media Storage */}
          {activeSubTab === 'media' && (
            <div className="json-table-wrapper">
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Media ID</th>
                    <th>Uploader</th>
                    <th>Encrypted &amp; Stored Date &amp; Time</th>
                    <th>MIME Type</th>
                    <th>Encrypted Binary Blob Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.media.map(m => (
                    <tr key={m.id}>
                      <td><code>{m.id}</code></td>
                      <td><strong>{m.uploader}</strong></td>
                      <td>
                        <div className="timestamp-badge">
                          <Clock size={12} color="#ec4899" />
                          <span>{formatDateTime(m.uploadedAt)}</span>
                        </div>
                      </td>
                      <td><code>{m.mimeType}</code></td>
                      <td>
                        <div className="ciphertext-code">{m.ciphertextPreview}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
