import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Music,
  Sparkles,
  Image as ImageIcon,
  Send,
  Lock,
  Loader2,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Smile,
  Play,
  Pause,
  Upload,
  Check,
  MapPin,
  Clock,
  Highlighter,
  Video
} from 'lucide-react';
import { encryptPost } from '../crypto/e2ee';
import MediaUploader from './MediaUploader';
import { musicEngine, PRESET_TRACKS } from '../utils/musicEngine';

const GRADIENTS = [
  { name: 'Cyber Rose', value: 'linear-gradient(135deg, #1f0d14 0%, #4a1525 50%, #881337 100%)' },
  { name: 'Midnight Nebula', value: 'linear-gradient(135deg, #090314 0%, #1e113a 50%, #3b0764 100%)' },
  { name: 'Deep Cyber Void', value: 'linear-gradient(135deg, #07070a 0%, #12111c 50%, #1e1b2e 100%)' },
  { name: 'Sunset Blaze', value: 'linear-gradient(135deg, #2b0b14 0%, #7c1d2e 50%, #c2410c 100%)' },
  { name: 'Electric Violet', value: 'linear-gradient(135deg, #180929 0%, #4c1d95 50%, #831843 100%)' },
  { name: 'Pitch Black AMOLED', value: 'linear-gradient(135deg, #000000 0%, #09090b 50%, #141118 100%)' },
  { name: 'Twilight Ocean', value: 'linear-gradient(135deg, #05131e 0%, #0c2e4e 50%, #0e7490 100%)' },
  { name: 'Rosy Coral', value: 'linear-gradient(135deg, #701a2c 0%, #e06c75 50%, #ee7882 100%)' }
];

const FONT_STYLES = [
  { id: 'modern', name: 'Modern', className: 'font-modern' },
  { id: 'cyber', name: 'Cyber', className: 'font-cyber' },
  { id: 'typewriter', name: 'Typewriter', className: 'font-typewriter' },
  { id: 'serif', name: 'Serif', className: 'font-serif' },
  { id: 'script', name: 'Script', className: 'font-script' },
  { id: 'impact', name: 'Impact', className: 'font-impact' }
];

const MOOD_STICKERS = [
  { id: 'vibe_hype', text: '🔥 On Fire' },
  { id: 'vibe_zone', text: '🎧 In The Zone' },
  { id: 'vibe_night', text: '🌙 Night Shift' },
  { id: 'vibe_energy', text: '⚡ High Voltage' },
  { id: 'vibe_coffee', text: '☕ Coffee Mode' },
  { id: 'vibe_coding', text: '💻 Cyber Coding' },
  { id: 'vibe_chill', text: '💎 Chill Vibes' },
  { id: 'vibe_love', text: '❤️ Feeling Loved' }
];

export default function StatusPublisherModal({ currentUser, allUsers, serverUrl, onClose, onStatusPublished }) {
  const [text, setText] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0].value);
  const [fontIndex, setFontIndex] = useState(0);
  const [alignment, setAlignment] = useState('center'); // 'center' | 'left' | 'right'
  const [highlightStyle, setHighlightStyle] = useState('none'); // 'none' | 'box' | 'neon'
  const [selectedMusic, setSelectedMusic] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [mediaPayload, setMediaPayload] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Active sheet drawer: null | 'music' | 'stickers' | 'gradients' | 'media'
  const [activeSheet, setActiveSheet] = useState(null);
  const [previewingTrackId, setPreviewingTrackId] = useState(null);

  const audioUploadInputRef = useRef(null);
  const mediaUploaderRef = useRef(null);

  // Clean up any music preview when unmounting or closing
  useEffect(() => {
    return () => {
      musicEngine.stop();
    };
  }, []);

  // Format current live time for Clock sticker
  const getCurrentTimeFormatted = () => {
    const d = new Date();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `🕒 ${hours}:${minutes} ${ampm}`;
  };

  // Close handler with discard confirmation
  const handleClose = () => {
    if (text.trim() || mediaPayload || selectedMusic || stickers.length > 0) {
      if (!window.confirm('Discard this status draft?')) {
        return;
      }
    }
    musicEngine.stop();
    onClose();
  };

  // Cycle font
  const cycleFont = () => {
    setFontIndex(prev => (prev + 1) % FONT_STYLES.length);
  };

  // Cycle text alignment
  const cycleAlignment = () => {
    const aligns = ['center', 'left', 'right'];
    const nextIdx = (aligns.indexOf(alignment) + 1) % aligns.length;
    setAlignment(aligns[nextIdx]);
  };

  // Cycle text highlight
  const cycleHighlight = () => {
    const highlights = ['none', 'box', 'neon'];
    const nextIdx = (highlights.indexOf(highlightStyle) + 1) % highlights.length;
    setHighlightStyle(highlights[nextIdx]);
  };

  // Toggle or add sticker
  const toggleSticker = (stickerObj) => {
    setStickers(prev => {
      const exists = prev.some(s => s.id === stickerObj.id);
      if (exists) {
        return prev.filter(s => s.id !== stickerObj.id);
      }
      return [...prev, stickerObj];
    });
  };

  // Preview / Play Track in Music Sheet
  const handlePreviewTrack = (track) => {
    if (previewingTrackId === track.id) {
      musicEngine.stop();
      setPreviewingTrackId(null);
    } else {
      musicEngine.playTrack(track, serverUrl);
      setPreviewingTrackId(track.id);
    }
  };

  // Select Track to attach to story (starts playback so author hears the vibe!)
  const handleSelectTrack = (track) => {
    setSelectedMusic(track);
    setPreviewingTrackId(track.id);
    musicEngine.playTrack(track, serverUrl);
    setActiveSheet(null);
  };

  // Remove attached music
  const handleRemoveMusic = (e) => {
    e.stopPropagation();
    setSelectedMusic(null);
    musicEngine.stop();
    setPreviewingTrackId(null);
  };

  // Handle custom audio file upload from user's device
  const handleCustomAudioUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const maxSize = 30 * 1024 * 1024; // 30MB
    if (file.size > maxSize) {
      alert('Audio file size must be under 30MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const audioUrl = event.target.result;
      // Extract title from filename
      let title = file.name.replace(/\.[^/.]+$/, '');
      let artist = currentUser.displayName || currentUser.username;
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      const customTrack = {
        id: `custom_${Date.now()}`,
        title,
        artist,
        audioUrl,
        genre: 'Custom Audio',
        emoji: '🎵',
        type: 'custom'
      };

      handleSelectTrack(customTrack);
    };
    reader.readAsDataURL(file);
  };

  // Publish Status Story
  const handlePublish = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaPayload && !selectedMusic) return;
    if (mediaUploading || submitting) return;

    setSubmitting(true);
    musicEngine.stop();

    try {
      // Collect public keys for multi-recipient envelopes
      const recipientPublicKeys = allUsers.map(u => ({
        username: u.username,
        spkiPublicKey: u.publicIdentityKey
      }));

      // Envelope-encrypt status text and media key
      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        text.trim(),
        recipientPublicKeys,
        mediaPayload?.mediaKeyB64 || null
      );

      const res = await fetch(`${serverUrl}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes,
          mediaId: mediaPayload?.mediaId || null,
          backgroundGradient: selectedGradient,
          durationHours: 24,
          music: selectedMusic ? {
            id: selectedMusic.id,
            title: selectedMusic.title,
            artist: selectedMusic.artist,
            audioUrl: selectedMusic.audioUrl || null,
            genre: selectedMusic.genre || 'Soundtrack'
          } : null,
          stickers,
          fontStyle: FONT_STYLES[fontIndex].id,
          textAlignment: alignment,
          textHighlight: highlightStyle
        })
      });

      if (!res.ok) throw new Error('Failed to publish status');
      const data = await res.json();

      if (onStatusPublished) onStatusPublished(data.status);
      onClose();
    } catch (err) {
      console.error('Status publish failed:', err);
      alert('Failed to publish status: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeFont = FONT_STYLES[fontIndex];

  return (
    <div className="status-publisher-fullscreen" onClick={() => setActiveSheet(null)}>
      {/* Hidden file input for custom audio upload */}
      <input
        ref={audioUploadInputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
        onChange={handleCustomAudioUpload}
        style={{ display: 'none' }}
      />

      {/* TOP STORY TOOLBAR */}
      <div className="story-top-toolbar" onClick={e => e.stopPropagation()}>
        {/* Left: Close Button */}
        <button
          type="button"
          className="story-tool-btn"
          onClick={handleClose}
          title="Close / Discard"
        >
          <X size={20} />
        </button>

        {/* Right: Studio Creative Tools */}
        <div className="story-tool-actions">
          {/* Theme Palette Switcher */}
          <button
            type="button"
            className={`story-tool-btn ${activeSheet === 'gradients' ? 'active' : ''}`}
            onClick={() => setActiveSheet(prev => (prev === 'gradients' ? null : 'gradients'))}
            title="Choose Background Gradient"
          >
            <Palette size={18} />
          </button>

          {/* Typography Cycler */}
          <button
            type="button"
            className="story-tool-btn"
            onClick={cycleFont}
            title={`Font: ${activeFont.name} (Tap to change)`}
          >
            <Type size={18} />
          </button>

          {/* Text Alignment */}
          <button
            type="button"
            className="story-tool-btn"
            onClick={cycleAlignment}
            title={`Alignment: ${alignment}`}
          >
            {alignment === 'center' ? <AlignCenter size={18} /> : alignment === 'left' ? <AlignLeft size={18} /> : <AlignRight size={18} />}
          </button>

          {/* Highlight Style */}
          <button
            type="button"
            className={`story-tool-btn ${highlightStyle !== 'none' ? 'active' : ''}`}
            onClick={cycleHighlight}
            title={`Highlight: ${highlightStyle}`}
          >
            <Highlighter size={18} />
          </button>

          {/* Music Button */}
          {selectedMusic ? (
            <button
              type="button"
              className="story-tool-pill active"
              onClick={() => setActiveSheet(prev => (prev === 'music' ? null : 'music'))}
              title="Music Selected - tap to change"
            >
              <Music size={15} />
              <div className="equalizer-wave">
                <span className="equalizer-bar" />
                <span className="equalizer-bar" />
                <span className="equalizer-bar" />
              </div>
              <span className="story-pill-text">{selectedMusic.title}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`story-tool-btn ${activeSheet === 'music' ? 'active' : ''}`}
              onClick={() => setActiveSheet(prev => (prev === 'music' ? null : 'music'))}
              title="Attach Music / Song"
            >
              <Music size={18} />
            </button>
          )}

          {/* Stickers & Vibe */}
          <button
            type="button"
            className={`story-tool-btn ${stickers.length > 0 ? 'active' : ''}`}
            onClick={() => setActiveSheet(prev => (prev === 'stickers' ? null : 'stickers'))}
            title="Add Stickers / Mood"
          >
            <Smile size={18} />
          </button>

          {/* Media / Photo Attachment */}
          <button
            type="button"
            className={`story-tool-btn ${mediaPayload ? 'active' : ''}`}
            onClick={() => setActiveSheet(prev => (prev === 'media' ? null : 'media'))}
            title="Attach Media or Photo"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </div>

      {/* FULL-SCREEN IMMERSIVE STORY CANVAS */}
      <div
        className="story-fullscreen-canvas"
        style={{ background: selectedGradient }}
        onClick={() => setActiveSheet(null)}
      >
        {/* Full-screen media preview layer (Visible while editing!) */}
        {mediaPayload?.localPreviewUrl ? (
          <div className="story-canvas-media-layer">
            {mediaPayload.isVideo || (mediaPayload.mimeType && mediaPayload.mimeType.startsWith('video/')) ? (
              <video
                src={mediaPayload.localPreviewUrl}
                autoPlay
                loop
                muted
                playsInline
                className="story-canvas-media-element"
              />
            ) : (
              <img
                src={mediaPayload.localPreviewUrl}
                alt="Story Media"
                className="story-canvas-media-element"
              />
            )}
            <div className="story-canvas-media-vignette" />
          </div>
        ) : (
          <div className="story-canvas-scrim" />
        )}

        {/* Center Dynamic Story Content */}
        <div className="story-canvas-content" onClick={e => e.stopPropagation()}>
          {/* Floating Music Sticker on Canvas (if music chosen) */}
          {selectedMusic && (
            <div
              className="story-music-sticker"
              onClick={() => {
                if (previewingTrackId === selectedMusic.id && musicEngine.isPlaying()) {
                  musicEngine.stop();
                  setPreviewingTrackId(null);
                } else {
                  musicEngine.playTrack(selectedMusic, serverUrl);
                  setPreviewingTrackId(selectedMusic.id);
                }
              }}
              title="Tap to play or pause music"
            >
              <Music size={16} color="#ee7882" />
              {previewingTrackId === selectedMusic.id ? (
                <div className="equalizer-wave">
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                </div>
              ) : (
                <Play size={13} color="#ee7882" style={{ marginLeft: '2px' }} />
              )}
              <div className="sticker-music-info">
                <span className="sticker-music-title">{selectedMusic.title}</span>
                <span className="sticker-music-artist">{selectedMusic.artist}</span>
              </div>
              <button
                type="button"
                className="remove-music-btn"
                onClick={handleRemoveMusic}
                title="Remove music"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Active Mood / Location Stickers */}
          {stickers.length > 0 && (
            <div className="story-active-stickers">
              {stickers.map(st => (
                <div key={st.id} className="story-sticker-item">
                  <span>{st.text}</span>
                  <button
                    type="button"
                    className="story-sticker-remove"
                    onClick={() => toggleSticker(st)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Encrypting media indicator */}
          {mediaUploading && (
            <div className="story-media-uploading-indicator">
              <Loader2 size={16} className="animate-spin" color="#ee7882" />
              <span>Securing & Encrypting Media...</span>
            </div>
          )}

          {/* Interactive Text Input Area */}
          <textarea
            autoFocus
            rows={4}
            maxLength={280}
            placeholder={mediaPayload ? "Add a caption to your photo or video..." : "Type your story... (24h end-to-end encrypted)"}
            value={text}
            onChange={e => setText(e.target.value)}
            className={`story-textarea ${activeFont.className} highlight-${highlightStyle}`}
            style={{ textAlign: alignment }}
          />

          {/* Media Attachment Mini-Card if attached */}
          {mediaPayload && (
            <div className="story-attached-media-pill">
              {mediaPayload.isVideo || (mediaPayload.mimeType && mediaPayload.mimeType.startsWith('video/')) ? (
                <Video size={14} color="#ee7882" />
              ) : (
                <ImageIcon size={14} color="#ee7882" />
              )}
              <span className="story-attached-media-name" title={mediaPayload.originalName}>
                {mediaPayload.originalName || (mediaPayload.isVideo ? 'Attached Video' : 'Attached Photo')}
              </span>
              <button
                type="button"
                className="story-attached-media-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaPayload(null);
                  mediaUploaderRef.current?.clearFile?.();
                }}
                title="Remove attached photo or video"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="story-bottom-bar" onClick={e => e.stopPropagation()}>
        {/* Security badge with ZERO GREEN ACCENTS */}
        <div className="story-security-badge">
          <Lock size={13} color="#ee7882" />
          <span>24h E2EE Encrypted</span>
        </div>

        {/* Character Counter & Post Action */}
        <div style={{ display: 'flex', alignContent: 'center', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.65)' }}>
            {280 - text.length}
          </span>

          <button
            type="button"
            className="story-post-btn"
            onClick={handlePublish}
            disabled={(!text.trim() && !mediaPayload && !selectedMusic) || mediaUploading || submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Securing...</span>
              </>
            ) : (
              <>
                <span>Post Status</span>
                <Send size={15} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SHEET 1: MUSIC PICKER DRAWER
          ───────────────────────────────────────────────────────────── */}
      {activeSheet === 'music' && (
        <div className="story-bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-header">
            <div className="sheet-title-group">
              <Music size={18} color="#ee7882" />
              <h3>Add Music & Soundtrack</h3>
            </div>
            <button className="sheet-close-btn" onClick={() => setActiveSheet(null)}>
              <X size={16} />
            </button>
          </div>

          {/* Custom audio upload trigger */}
          <button
            type="button"
            className="custom-audio-upload-btn"
            onClick={() => audioUploadInputRef.current?.click()}
          >
            <Upload size={18} />
            <span>Upload Song / Audio from Device (.mp3, .m4a, .wav)</span>
          </button>

          {/* Curated Soundtracks List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Curated Cyber & Ambient Hits:
            </span>

            {PRESET_TRACKS.map(track => {
              const isSelected = selectedMusic?.id === track.id;
              const isPlaying = previewingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className={`music-track-item ${isSelected ? 'selected' : ''}`}
                >
                  <div className="music-track-left">
                    <button
                      type="button"
                      className={`music-play-circle ${isPlaying ? 'playing' : ''}`}
                      onClick={() => handlePreviewTrack(track)}
                      title={isPlaying ? 'Pause preview' : 'Play preview'}
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
                    </button>

                    <div className="music-track-meta">
                      <span className="music-track-title">{track.title}</span>
                      <span className="music-track-sub">
                        {track.emoji} {track.artist} • {track.genre}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`music-select-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectTrack(track)}
                  >
                    {isSelected ? 'Attached' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SHEET 2: STICKERS & MOODS DRAWER
          ───────────────────────────────────────────────────────────── */}
      {activeSheet === 'stickers' && (
        <div className="story-bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-header">
            <div className="sheet-title-group">
              <Smile size={18} color="#ee7882" />
              <h3>Stickers & Moods</h3>
            </div>
            <button className="sheet-close-btn" onClick={() => setActiveSheet(null)}>
              <X size={16} />
            </button>
          </div>

          {/* Quick Dynamic Badges: Clock & Location */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="sticker-chip-btn"
              onClick={() => toggleSticker({ id: 'live_clock', text: getCurrentTimeFormatted() })}
            >
              <Clock size={15} color="#ee7882" />
              <span>Current Time</span>
            </button>

            <button
              type="button"
              className="sticker-chip-btn"
              onClick={() => toggleSticker({ id: 'loc_cyber', text: '📍 Cyber City' })}
            >
              <MapPin size={15} color="#ee7882" />
              <span>Location: Cyber City</span>
            </button>

            <button
              type="button"
              className="sticker-chip-btn"
              onClick={() => toggleSticker({ id: 'loc_mumbai', text: '📍 Mumbai' })}
            >
              <MapPin size={15} color="#ee7882" />
              <span>Mumbai</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Choose Your Vibe:
            </span>
            <div className="sticker-chips-grid">
              {MOOD_STICKERS.map(mood => {
                const isSelected = stickers.some(s => s.id === mood.id);
                return (
                  <button
                    key={mood.id}
                    type="button"
                    className={`sticker-chip-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => toggleSticker(mood)}
                    style={isSelected ? { borderColor: '#ee7882', background: 'rgba(238, 120, 130, 0.25)', color: '#ff9ea8' } : {}}
                  >
                    <span>{mood.text}</span>
                    {isSelected && <Check size={14} color="#ee7882" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SHEET 3: GRADIENTS PALETTE DRAWER
          ───────────────────────────────────────────────────────────── */}
      {activeSheet === 'gradients' && (
        <div className="story-bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-header">
            <div className="sheet-title-group">
              <Palette size={18} color="#ee7882" />
              <h3>Color Theme & Atmosphere</h3>
            </div>
            <button className="sheet-close-btn" onClick={() => setActiveSheet(null)}>
              <X size={16} />
            </button>
          </div>

          <div className="palette-grid">
            {GRADIENTS.map((g, idx) => (
              <div
                key={idx}
                className={`palette-item ${selectedGradient === g.value ? 'active' : ''}`}
                style={{ background: g.value }}
                onClick={() => setSelectedGradient(g.value)}
              >
                <span>{g.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SHEET 4: MEDIA UPLOADER DRAWER
          ───────────────────────────────────────────────────────────── */}
      {activeSheet === 'media' && (
        <div className="story-bottom-sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-header">
            <div className="sheet-title-group">
              <ImageIcon size={18} color="#ee7882" />
              <h3>Attach Photo or Video</h3>
            </div>
            <button className="sheet-close-btn" onClick={() => setActiveSheet(null)}>
              <X size={16} />
            </button>
          </div>

          <MediaUploader
            ref={mediaUploaderRef}
            currentUser={currentUser}
            uploaderName={currentUser?.username}
            serverUrl={serverUrl}
            onMediaEncrypted={payload => {
              setMediaPayload(payload);
              if (payload) setActiveSheet(null);
            }}
            onUploadStateChange={uploading => setMediaUploading(uploading)}
          />
        </div>
      )}
    </div>
  );
}
